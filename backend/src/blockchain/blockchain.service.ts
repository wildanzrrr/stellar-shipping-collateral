import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  Networks,
  rpc as stellarRpc,
  contract as stellarContract,
  TransactionBuilder,
  Transaction,
  Contract,
  Address,
  nativeToScVal,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import {
  Client as IdentityVerifierClient,
  networks as identityVerifierNetworks,
  IdentityRole,
} from 'src/packages/identity_verifier/dist/index.js';
import {
  Client as FactoryClient,
  networks as factoryNetworks,
  RWA,
  RWAStatus,
} from 'src/packages/factory/dist/index.js';
import { KycStatus, KybStatus, UserRole } from 'prisma/generated/prisma/client';
import type { UserWithRelations } from 'src/users/users.repository';
import { createHash, randomBytes } from 'node:crypto';
import { xdr, StrKey } from '@stellar/stellar-sdk';

/** Well-known public Soroban RPC endpoints for Stellar Testnet. */
const DEFAULT_TESTNET_RPCS = [
  'https://soroban-rpc.testnet.stellar.gateway.fm',
  'https://soroban-testnet.stellar.org',
];

/**
 * Ordered list of Soroban RPC endpoints used for failover. `SOROBAN_RPC_URL`
 * may be a single URL or a comma-separated list; whatever is configured is
 * tried first, then the well-known public endpoints are appended (de-duped) so
 * a single unreachable or out-of-sync endpoint never takes the flow down.
 */
const SOROBAN_RPC_URLS: string[] = Array.from(
  new Set(
    [
      ...(process.env.SOROBAN_RPC_URL?.split(',').map((s) => s.trim()) ?? []),
      ...DEFAULT_TESTNET_RPCS,
    ].filter((u) => u.length > 0),
  ),
);

/** Network passphrase — must match the contract deployment network. */
const NETWORK_PASSPHRASE = Networks.TESTNET;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Whether an error thrown by a Soroban RPC call is transient and worth
 * retrying — gateway 5xx / rate-limit responses, network resets, and the
 * out-of-sync-node "Account not found" that some public RPC providers return
 * intermittently even for funded accounts.
 */
function isTransientRpcError(err: unknown): boolean {
  const e = err as {
    response?: { status?: number };
    status?: number;
    code?: string;
    message?: string;
    isAxiosError?: boolean;
  };
  const status = e?.response?.status ?? e?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504)
    return true;

  // Axios/fetch network-level failures (DNS, refused connection, unreachable
  // host) surface as an error with no HTTP response — "fetch failed".
  if (e?.isAxiosError && !e?.response) return true;

  const code = e?.code;
  if (
    code === 'ERR_BAD_RESPONSE' ||
    code === 'ERR_NETWORK' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  )
    return true;

  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|network error|server unavailable|service unavailable|bad gateway|gateway timeout|\b50[234]\b|Account not found|try again|ECONN|ENOTFOUND|EAI_AGAIN/i.test(
    msg,
  );
}

// ─── Constants (mirrors scripts/src/lib.ts) ──────────────────────────────

export const LEDGERS_PER_DAY = 17_280;
export const LEDGERS_PER_HOUR = 720;
export const USDC_SCALE = 10_000_000n;

// ─── Permit message helpers (from scripts/src/lib.ts) ────────────────────

export function buildPermitMessage(opts: {
  contractAddress: string;
  action: 1 | 2;
  accountAddress: string;
  amount: bigint;
  nonce: bigint;
  deadline: number;
}): Uint8Array {
  const { contractAddress, action, accountAddress, amount, nonce, deadline } =
    opts;

  const parts: Uint8Array[] = [];
  parts.push(new TextEncoder().encode('SEP57_PERMIT_V1'));
  parts.push(new Uint8Array([action]));
  parts.push(encodeLenPrefixedStr(contractAddress));
  parts.push(encodeLenPrefixedStr(accountAddress));
  parts.push(bigIntToBEBytes(amount, 16));
  parts.push(bigIntToBEBytes(nonce, 8));
  parts.push(uint32ToBEBytes(deadline));
  return concat(parts);
}

function encodeLenPrefixedStr(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, 4);
  return out;
}

function bigIntToBEBytes(n: bigint, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  let v = n;
  for (let i = byteLen - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function uint32ToBEBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

function concat(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function nextNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n & 0xffffffffffffffffn;
}

export function predictTokenAddress(
  factoryAddress: string,
  salt: Uint8Array,
): string {
  if (salt.length !== 32)
    throw new Error(`salt must be 32 bytes, got ${salt.length}`);
  const deployerRaw = StrKey.decodeContract(factoryAddress);
  const networkId = createHash('sha256')
    .update(Buffer.from(NETWORK_PASSPHRASE))
    .digest();
  const fromAddress = new xdr.ContractIdPreimageFromAddress({
    address: xdr.ScAddress.scAddressTypeContract(
      deployerRaw as unknown as xdr.Hash,
    ),
    salt: Buffer.from(salt),
  });
  const contractIdPreimage =
    xdr.ContractIdPreimage.contractIdPreimageFromAddress(fromAddress);
  const preimageCid = new xdr.HashIdPreimageContractId({
    networkId,
    contractIdPreimage,
  });
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(preimageCid);
  const id = createHash('sha256').update(preimage.toXDR()).digest();
  return StrKey.encodeContract(id);
}

/**
 * BlockchainService — Soroban smart-contract bridge.
 *
 * Syncs KYC / KYB verification results from Sumsub into the on-chain
 * `identity-verifier` contract. When a user's KYC or KYB status reaches
 * COMPLETED (Sumsub `applicantReviewed` → GREEN), we call
 * `set_identity(user, verified=true, country_code, role, operator)` so the
 * contract's identity registry reflects the off-chain verification.
 *
 * The `operator` is the admin Stellar account derived from `ADMIN_SECRET`
 * (the raw 32-byte ed25519 seed, hex-encoded). The same admin that
 * initialized the `identity-verifier` contract must sign the
 * `set_identity` transaction.
 *
 * Contract bindings live in `src/packages/identity_verifier/` (generated by
 * `stellar contract bindings typescript`). The contract id + network
 * passphrase are baked into the bindings' `networks` constant.
 */

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  /** Admin Keypair derived from ADMIN_SECRET. */
  private adminKeypair!: Keypair;

  /** Admin's Stellar public key (G...) — used as `operator` / source account. */
  private adminAddress!: string;

  /** Identity-verifier contract clients — one per RPC endpoint. */
  private identityClients!: IdentityVerifierClient[];

  /** Factory contract clients (RWA tokenization) — one per RPC endpoint. */
  private factoryClients!: FactoryClient[];

  /** Factory contract ID (C...). */
  private factoryContractId!: string;

  /** Soroban RPC server instances — one per RPC endpoint. */
  private rpcServers!: stellarRpc.Server[];

  /** Index of the currently active RPC endpoint (rotated on failover). */
  private activeRpc = 0;

  // Immutable factory config reads — cached after the first success so they
  // stay off the hot path (and out of RPC failure modes) on every issuance.
  private cachedUsdcAddress?: string;
  private cachedProtocolFeeBps?: bigint;

  /** The active identity-verifier client for the current endpoint. */
  private get identityClient(): IdentityVerifierClient {
    return this.identityClients[this.activeRpc];
  }

  /** The active factory client for the current endpoint. */
  private get factoryClient(): FactoryClient {
    return this.factoryClients[this.activeRpc];
  }

  /** The active Soroban RPC server for the current endpoint. */
  private get rpcServer(): stellarRpc.Server {
    return this.rpcServers[this.activeRpc];
  }

  /** The active RPC endpoint URL. */
  private get activeRpcUrl(): string {
    return SOROBAN_RPC_URLS[this.activeRpc];
  }

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const adminSecret = this.config.getOrThrow<string>('ADMIN_SECRET');

    // ADMIN_SECRET can be either a Stellar secret key (S...) or a raw
    // 32-byte ed25519 seed (hex string, 64 chars).
    if (adminSecret.startsWith('S')) {
      this.adminKeypair = Keypair.fromSecret(adminSecret);
    } else {
      const seed = Buffer.from(adminSecret, 'hex');
      if (seed.length !== 32) {
        throw new Error(
          `ADMIN_SECRET must be a Stellar secret key (S...) or a 32-byte hex string (got ${seed.length} bytes)`,
        );
      }
      this.adminKeypair = Keypair.fromRawEd25519Seed(seed);
    }
    this.adminAddress = this.adminKeypair.publicKey();
    this.logger.log(`Admin address derived: ${this.adminAddress}`);

    // Build one client trio (identity + factory + raw RPC server) per RPC
    // endpoint so `withRpcRetry` can rotate to a healthy endpoint when the
    // active one is unreachable / out-of-sync.
    const net = identityVerifierNetworks.testnet;
    const factoryNet = factoryNetworks.testnet;
    this.factoryContractId = factoryNet.contractId;

    this.identityClients = SOROBAN_RPC_URLS.map(
      (rpcUrl) =>
        new IdentityVerifierClient({
          contractId: net.contractId,
          networkPassphrase: NETWORK_PASSPHRASE,
          rpcUrl,
          publicKey: this.adminAddress,
          ...stellarContract.basicNodeSigner(
            this.adminKeypair,
            NETWORK_PASSPHRASE,
          ),
        }),
    );

    this.factoryClients = SOROBAN_RPC_URLS.map(
      (rpcUrl) =>
        new FactoryClient({
          contractId: factoryNet.contractId,
          networkPassphrase: NETWORK_PASSPHRASE,
          rpcUrl,
          publicKey: this.adminAddress,
          ...stellarContract.basicNodeSigner(
            this.adminKeypair,
            NETWORK_PASSPHRASE,
          ),
        }),
    );

    this.rpcServers = SOROBAN_RPC_URLS.map(
      (rpcUrl) => new stellarRpc.Server(rpcUrl),
    );

    this.logger.log(
      `IdentityVerifier client ready → contract ${net.contractId}`,
    );
    this.logger.log(
      `Factory client ready → contract ${this.factoryContractId}`,
    );
    this.logger.log(
      `Soroban RPC endpoints (failover order): ${SOROBAN_RPC_URLS.join(', ')}`,
    );
  }

  /**
   * Sync a user's verification status to the on-chain identity-verifier.
   *
   * Called from the Sumsub webhook handler when `kycStatus` or `kybStatus`
   * transitions to COMPLETED or REJECTED. Only COMPLETED triggers
   * `verified = true`; REJECTED triggers `verified = false` so any existing
   * on-chain identity record is revoked.
   *
   * @param user  — the user record (must have a wallet address)
   * @param type  — 'kyc' or 'kyb'
   * @param verified — whether the user passed verification
   * @param countryCode — ISO 3166-1 alpha-2 country code (defaults to '' if unknown)
   */
  async syncIdentity(
    user: UserWithRelations,
    type: 'kyc' | 'kyb',
    verified: boolean,
    countryCode: string,
  ): Promise<void> {
    if (!user.wallet?.address) {
      this.logger.warn(
        `User ${user.id} has no wallet address — skipping on-chain sync`,
      );
      return;
    }

    const role =
      type === 'kyb' || user.role === UserRole.SHIPPING_COMPANY
        ? IdentityRole.KYB
        : IdentityRole.KYC;

    this.logger.log(
      `Syncing identity on-chain → user=${user.id} addr=${user.wallet.address} verified=${verified} role=${type.toUpperCase()}`,
    );

    try {
      const tx = await this.identityClient.set_identity({
        user: user.wallet.address,
        verified,
        country_code: countryCode || '',
        role,
        operator: this.adminAddress,
      });

      const sent = await tx.signAndSend();
      const hash = sent.sendTransactionResponse?.hash;
      const status = sent.getTransactionResponse?.status;

      this.logger.log(
        `Identity synced on-chain → hash=${hash ?? 'pending'} status=${status ?? 'submitted'}`,
      );
    } catch (error) {
      this.logger.error(
        `On-chain identity sync failed for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Don't throw — webhook should still return 200 to Sumsub so it doesn't
      // retry. The off-chain DB is already updated; on-chain sync can be
      // retried later via a reconciliation job.
    }
  }

  /**
   * Convenience: map a KYC status change to an on-chain sync call.
   * Only called when kycStatus transitions to COMPLETED or REJECTED.
   */
  async syncKycStatus(
    user: UserWithRelations,
    newStatus: KycStatus,
  ): Promise<void> {
    if (newStatus === KycStatus.COMPLETED) {
      await this.syncIdentity(user, 'kyc', true, user.companyCountry ?? '');
    } else if (newStatus === KycStatus.REJECTED) {
      await this.syncIdentity(user, 'kyc', false, user.companyCountry ?? '');
    }
  }

  /**
   * Convenience: map a KYB status change to an on-chain sync call.
   * Only called when kybStatus transitions to COMPLETED or REJECTED.
   */
  async syncKybStatus(
    user: UserWithRelations,
    newStatus: KybStatus,
  ): Promise<void> {
    if (newStatus === KybStatus.COMPLETED) {
      await this.syncIdentity(user, 'kyb', true, user.companyCountry ?? '');
    } else if (newStatus === KybStatus.REJECTED) {
      await this.syncIdentity(user, 'kyb', false, user.companyCountry ?? '');
    }
  }

  // ─── Factory / RWA methods ────────────────────────────────────────────

  /** The factory contract client (for building/simulating transactions). */
  get factory(): FactoryClient {
    return this.factoryClient;
  }

  /** The factory contract ID (C...). */
  get factoryContractAddress(): string {
    return this.factoryContractId;
  }

  /**
   * Build a factory client scoped to a shipper's wallet address.
   * Used for transactions where the shipper is the source account
   * (e.g. create_rwa_token) so Soroban require_auth(shipper) passes.
   * No signer is attached — the tx is signed externally via DFNS.
   */
  factoryForShipper(shipperAddress: string): FactoryClient {
    return new FactoryClient({
      contractId: this.factoryContractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: this.activeRpcUrl,
      publicKey: shipperAddress,
      // No signer — tx will be signed by DFNS on the frontend
    });
  }

  /** The admin Keypair (used to sign permit messages). */
  get adminKey(): Keypair {
    return this.adminKeypair;
  }

  /** The admin's Stellar public key (G...). */
  get adminPublicKey(): string {
    return this.adminAddress;
  }

  /** The network passphrase. */
  get networkPassphrase(): string {
    return NETWORK_PASSPHRASE;
  }

  /** The Soroban RPC server instance. */
  get rpc(): stellarRpc.Server {
    return this.rpcServer;
  }

  /**
   * Retry a Soroban RPC call on transient failures (gateway 5xx, rate limits,
   * network resets, unreachable host / "fetch failed", out-of-sync-node
   * "Account not found"). On each transient failure it rotates to the next
   * configured RPC endpoint before backing off, so an unreachable or stale
   * endpoint is bypassed rather than retried in place. Non-transient errors
   * (e.g. real simulation failures) bubble up immediately so we don't mask
   * genuine problems.
   *
   * `fn` reads the active client/server via getters, so simply advancing
   * `activeRpc` makes the next attempt target a different endpoint.
   */
  private async withRpcRetry<T>(
    fn: () => Promise<T>,
    label: string,
  ): Promise<T> {
    const n = SOROBAN_RPC_URLS.length;
    // Give every endpoint at least two passes (min 4 attempts) so a brief
    // outage across all endpoints still gets a couple of retries.
    const attempts = Math.max(4, n * 2);
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i === attempts - 1 || !isTransientRpcError(err)) throw err;
        const failedUrl = this.activeRpcUrl;
        if (n > 1) this.activeRpc = (this.activeRpc + 1) % n;
        const delayMs = 400 * 2 ** Math.min(i, 3); // 400ms → 3.2s cap
        this.logger.warn(
          `Transient RPC error on ${label} via ${failedUrl} (attempt ${i + 1}/${attempts}); switching to ${this.activeRpcUrl}, retry in ${delayMs}ms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await sleep(delayMs);
      }
    }
    throw lastErr;
  }

  /** Fetch the latest ledger sequence from Soroban RPC. */
  async getLatestLedger(): Promise<number> {
    const resp = await this.withRpcRetry(
      () => this.rpcServer.getLatestLedger(),
      'getLatestLedger',
    );
    return resp.sequence;
  }

  /**
   * Submit a signed Soroban transaction (after DFNS signing on the frontend).
   * Decodes the XDR and sends it to Soroban RPC.
   */
  async submitTransaction(signedTxXdr: string): Promise<{
    hash: string;
    status: string;
    errorResultXdr: string | null;
  }> {
    const tx = TransactionBuilder.fromXDR(
      signedTxXdr,
      NETWORK_PASSPHRASE,
    ) as Transaction;

    this.logger.debug('Submitting tx', {
      source: tx.source,
      fee: tx.fee,
      operations: tx.operations.length,
      hasSorobanData: !!tx.toXDR().includes('soroban'),
      seqNum: tx.sequence,
    });

    // Re-sending the same signed envelope is safe: a duplicate lands as
    // TRY_AGAIN_LATER / DUPLICATE rather than double-applying, so wrapping the
    // send in the failover retry only helps when an endpoint is unreachable.
    const sent = await this.withRpcRetry(
      () => this.rpcServer.sendTransaction(tx),
      'sendTransaction',
    );

    this.logger.debug('sendTransaction result', {
      status: sent.status,
      hash: sent.hash,
      errorResultXdr: sent.errorResult?.toXDR('base64') ?? null,
    });

    // `sendTransaction` only tells us the tx was accepted into the mempool
    // (PENDING); it never returns SUCCESS. Reject immediately on ERROR /
    // TRY_AGAIN_LATER, otherwise poll `getTransaction` until the tx lands in a
    // ledger so callers see the real on-chain outcome (and, for multi-step
    // flows, so downstream simulations observe the applied state).
    if (sent.status === 'ERROR') {
      return {
        hash: sent.hash,
        status: 'FAILED',
        errorResultXdr: sent.errorResult?.toXDR('base64') ?? null,
      };
    }

    // The tx is already in the mempool (PENDING) at this point, so polling is
    // idempotent — wrap it in a retry so a transient gateway 5xx while polling
    // doesn't fail an operation that actually succeeded on-chain.
    const final = await this.withRpcRetry(
      () => this.rpcServer.pollTransaction(sent.hash, { attempts: 20 }),
      'pollTransaction',
    );

    this.logger.debug('pollTransaction result', {
      status: final.status,
      hash: sent.hash,
    });

    const errorResultXdr =
      final.status === stellarRpc.Api.GetTransactionStatus.FAILED
        ? (final.resultXdr?.toXDR('base64') ?? null)
        : null;

    return {
      hash: sent.hash,
      status: final.status,
      errorResultXdr,
    };
  }

  /** Read the USDC (payment token) contract address from the factory. */
  async getUsdcAddress(): Promise<string> {
    // Immutable factory config — fetch once, then serve from cache.
    if (this.cachedUsdcAddress) return this.cachedUsdcAddress;
    const tx = await this.withRpcRetry(
      () => this.factoryClient.usdc(),
      'factory.usdc',
    );
    this.cachedUsdcAddress = tx.result;
    return tx.result;
  }

  /** Read the protocol fee (bps) configured on the factory. */
  async getProtocolFeeBps(): Promise<bigint> {
    // Immutable factory config — fetch once, then serve from cache.
    if (this.cachedProtocolFeeBps !== undefined)
      return this.cachedProtocolFeeBps;
    const tx = await this.withRpcRetry(
      () => this.factoryClient.protocol_fee_bps(),
      'factory.protocol_fee_bps',
    );
    const value = BigInt(tx.result);
    this.cachedProtocolFeeBps = value;
    return value;
  }

  /**
   * Rewrite any `sorobanCredentialsAddress` auth entries to
   * `sorobanCredentialsSourceAccount`.
   *
   * Our transactions always use the account that must authorize (the shipper)
   * as the transaction source, and it is signed at the envelope level by DFNS.
   * Source-account credentials are satisfied by that envelope signature, so we
   * swap the simulation-produced address credentials — which would otherwise
   * need their own separate Soroban auth signature — for source-account ones.
   */
  convertShipperAuthToSourceAccount(txXdr: string): string {
    const env = xdr.TransactionEnvelope.fromXDR(txXdr, 'base64');
    const tx = env.v1().tx();
    for (const op of tx.operations()) {
      if (op.body().switch().name !== 'invokeHostFunction') continue;
      const auth = op.body().invokeHostFunctionOp().auth();
      for (const entry of auth) {
        if (entry.credentials().switch().name === 'sorobanCredentialsAddress') {
          entry.credentials(
            xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
          );
        }
      }
    }
    return env.toXDR('base64');
  }

  /**
   * Build an assembled USDC `approve(owner, spender, amount, expiration_ledger)`
   * transaction with `owner` as the source account, ready for DFNS signing.
   * Returns the transaction XDR (with source-account auth credentials).
   */
  async buildApproveTx(opts: {
    ownerAddress: string;
    spenderAddress: string;
    amount: bigint;
    expirationLedger: number;
  }): Promise<string> {
    const usdcAddress = await this.getUsdcAddress();
    const account = await this.withRpcRetry(
      () => this.rpcServer.getAccount(opts.ownerAddress),
      'getAccount(owner)',
    );
    const tokenContract = new Contract(usdcAddress);

    const raw = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        tokenContract.call(
          'approve',
          nativeToScVal(Address.fromString(opts.ownerAddress), {
            type: 'address',
          }),
          nativeToScVal(Address.fromString(opts.spenderAddress), {
            type: 'address',
          }),
          nativeToScVal(opts.amount, { type: 'i128' }),
          nativeToScVal(opts.expirationLedger, { type: 'u32' }),
        ),
      )
      .setTimeout(300)
      .build();

    const sim = await this.withRpcRetry(
      () => this.rpcServer.simulateTransaction(raw),
      'simulateTransaction(approve)',
    );
    if (stellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`approve simulation failed: ${sim.error}`);
    }

    const assembled = stellarRpc.assembleTransaction(raw, sim).build();
    return this.convertShipperAuthToSourceAccount(assembled.toXDR());
  }

  /**
   * Sign a SEP57 mint permit with the admin keypair.
   * Returns the signature bytes.
   */
  signMintPermit(opts: {
    contractAddress: string;
    accountAddress: string;
    amount: bigint;
    nonce: bigint;
    deadline: number;
  }): Uint8Array {
    const message = buildPermitMessage({
      contractAddress: opts.contractAddress,
      action: 1, // mint
      accountAddress: opts.accountAddress,
      amount: opts.amount,
      nonce: opts.nonce,
      deadline: opts.deadline,
    });
    return this.adminKeypair.sign(Buffer.from(message));
  }

  /**
   * Generate all the parameters needed for a `create_rwa_token` call:
   * salt, predicted token address, nonce, deadline, and admin-signed mint permit.
   */
  async prepareRwaTokenParams(opts: {
    raiseAmount: bigint;
    dueDays: number;
    deadlineHours?: number;
  }): Promise<{
    salt: Uint8Array;
    predictedTokenAddress: string;
    nonce: bigint;
    deadline: number;
    dueLedger: number;
    mintSignature: Uint8Array;
  }> {
    const salt = new Uint8Array(randomBytes(32));
    const predictedTokenAddress = predictTokenAddress(
      this.factoryContractId,
      salt,
    );
    const latestLedger = await this.getLatestLedger();
    const nonce = nextNonce();
    const dueLedger = latestLedger + Math.round(opts.dueDays * LEDGERS_PER_DAY);
    const deadline =
      latestLedger + (opts.deadlineHours ?? 1) * LEDGERS_PER_HOUR;

    const mintSignature = this.signMintPermit({
      contractAddress: predictedTokenAddress,
      accountAddress: this.factoryContractId,
      amount: opts.raiseAmount,
      nonce,
      deadline,
    });

    return {
      salt,
      predictedTokenAddress,
      nonce,
      deadline,
      dueLedger,
      mintSignature,
    };
  }
}
