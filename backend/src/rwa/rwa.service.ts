import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RwaRepository } from './rwa.repository';
import { CollateralRepository } from 'src/collateral/collateral.repository';
import { SuccessResponseDTO } from 'src/utils/dto';
import { SettleDebtDTO, CreateRwaTokenDTO } from './rwa.dto';
import {
  BlockchainService,
  LEDGERS_PER_DAY,
} from 'src/blockchain/blockchain.service';
import { RWA, RWAStatus } from 'src/packages/factory/dist/index.js';
import { generateCustomId } from 'src/utils/utils';
import { rpc } from '@stellar/stellar-sdk';
import type { contract } from '@stellar/stellar-sdk';

/**
 * Guard against silent Soroban simulation failures.
 *
 * `AssembledTransaction.simulate()` does NOT throw when simulation fails — it
 * leaves `.built` as the raw, un-assembled transaction (base fee only, no
 * Soroban footprint/resource fee). If we sign and submit that, the network
 * rejects it as `txMALFORMED`, hiding the real contract-level error. This
 * surfaces the actual simulation error (e.g. "not enough allowance to spend")
 * so the caller sees a meaningful message.
 */
function assertSimulationSucceeded(
  assembled: contract.AssembledTransaction<unknown>,
  method: string,
): void {
  const sim = assembled.simulation;
  if (!sim) {
    throw new Error(`${method} was not simulated`);
  }
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} simulation failed: ${sim.error}`);
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new Error(
      `${method} requires restoring expired contract state before it can run`,
    );
  }
}

/**
 * RwaService — bridges the on-chain factory contract with off-chain collateral
 * and event data.
 *
 * All Stellar / Soroban interaction is delegated to `BlockchainService`.
 * This service only contains domain logic (parsing, joining with collateral,
 * assembling payloads).
 */
@Injectable()
export class RwaService {
  private readonly logger = new Logger(RwaService.name);

  constructor(
    private readonly rwaRepository: RwaRepository,
    private readonly collateralRepository: CollateralRepository,
    private readonly blockchain: BlockchainService,
  ) {}

  /** Get a single RWA from the factory + join with local collateral. */
  async getRwa(rwaId: string): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Getting RWA from factory', { rwaId });

      // `get_rwa` is a read-only view — simulate it (no signAndSend, so it
      // needs neither a funded admin account nor a submitted transaction).
      const tx = await this.blockchain.factory.get_rwa({ rwa_id: rwaId });
      const rwa = (await tx.simulate()).result;

      // Parse the on-chain RWA struct
      const rwaData = this.parseRwaStruct(rwa);

      // Resolve the due ledger to an approximate calendar date so the UI can
      // show "due in N days" instead of a raw ledger number users don't grok.
      const dueDate = await this.dueLedgerToDate(rwaData.dueLedger as number);

      // Join with local collateral
      const collateral = await this.collateralRepository.findByRwaId(rwaId);
      const events = await this.rwaRepository.findEventsByRwaId(rwaId);

      return {
        success: true,
        message: 'RWA retrieved successfully',
        data: {
          ...rwaData,
          dueDate,
          collateral: collateral ?? null,
          events,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error(`Error in getRwa for ${rwaId}`, error);
      throw error;
    }
  }

  /**
   * List all RWAs from the factory, optionally filtered by shipper (the
   * shipping company's own offerings) or by investor (only offerings the
   * investor holds shares in — the "My investment" view).
   */
  async listRwas(
    shipperAddress?: string,
    page = 1,
    limit = 20,
    investorAddress?: string,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Listing RWAs', {
        shipperAddress,
        investorAddress,
        page,
        limit,
      });

      const tx = await this.blockchain.factory.list_rwas();
      const simulated = await tx.simulate();
      const rwas = simulated.result as unknown as RWA[];

      // Filter by shipper (their issued RWAs) or investor. The investor list
      // ("My investment") includes every offering they have *ever* bought into
      // — even fully-claimed positions (holding now 0) remain in the on-chain
      // investors map, so we match on presence rather than a positive balance.
      let filtered = shipperAddress
        ? rwas.filter((r) => r.shipper === shipperAddress)
        : rwas;
      if (investorAddress) {
        filtered = filtered.filter((r) =>
          this.investorHasEntry(r, investorAddress),
        );
      }

      // Enrich every match with its local collateral, then sort newest-first by
      // the collateral's createdAt before paginating. RWAs live in an on-chain
      // map keyed by id (not creation order), so createdAt is the only reliable
      // chronological signal. Offerings without a local record sort last.
      const enrichedAll = await Promise.all(
        filtered.map(async (r) => {
          const collateral = await this.collateralRepository.findByRwaId(r.id);
          return {
            id: r.id,
            shipper: r.shipper,
            token: r.token,
            status: this.mapRwaStatus(r.status),
            raiseAmount: r.raise_amount.toString(),
            interestBps: Number(r.interest_bps),
            sharesBought: r.shares_bought.toString(),
            sharesTotal: r.shares_total.toString(),
            dueLedger: Number(r.due_ledger),
            collateral: collateral ?? null,
            createdAt: collateral?.createdAt
              ? new Date(collateral.createdAt).toISOString()
              : null,
            myShares: investorAddress
              ? this.investorHolding(r, investorAddress).toString()
              : undefined,
          };
        }),
      );

      enrichedAll.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });

      // Paginate the sorted list.
      const start = (page - 1) * limit;
      const items = enrichedAll.slice(start, start + limit);

      return {
        success: true,
        message: 'RWA list retrieved successfully',
        data: { items, total: filtered.length, page, limit },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in listRwas', error);
      throw error;
    }
  }

  /** List investors (SharesBought events) for a specific RWA. */
  async getInvestors(rwaId: string): Promise<SuccessResponseDTO> {
    try {
      const events = await this.rwaRepository.findEventsByRwaId(rwaId);
      const investors = events.filter(
        (e) => e.eventType === ('SHARES_BOUGHT' as any),
      );

      return {
        success: true,
        message: 'Investors retrieved successfully',
        data: { rwaId, investors },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in getInvestors', error);
      throw error;
    }
  }

  /**
   * Prepare a `create_rwa_token` invocation.
   *
   * Delegates salt/nonce/deadline/permit generation to `BlockchainService`.
   * Returns the assembled transaction XDR for the shipper to sign via DFNS.
   */
  async prepareCreateRwaToken(
    shipperAddress: string,
    payload: CreateRwaTokenDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      // Auto-generate tokenId if not provided by the client
      const tokenId = payload.tokenId ?? generateCustomId('tkn');
      this.logger.debug('Preparing create_rwa_token', {
        shipperAddress,
        tokenId,
      });

      const raiseAmount = BigInt(payload.raiseAmount);
      const interestBps = BigInt(payload.interestBps);

      const params = await this.blockchain.prepareRwaTokenParams({
        raiseAmount,
        dueDays: payload.dueDays,
      });

      // Assemble the create_rwa_token transaction with shipper as source
      // (Soroban require_auth(shipper) needs shipper as the tx source account)
      const shipperFactory = this.blockchain.factoryForShipper(shipperAddress);
      const tx = await shipperFactory.create_rwa_token({
        shipper: shipperAddress,
        token_id: tokenId,
        raise_amount: raiseAmount as any,
        interest_bps: interestBps as any,
        due_ledger: params.dueLedger,
        name: payload.name,
        symbol: payload.symbol,
        salt: Buffer.from(params.salt),
        nonce: params.nonce,
        deadline: params.deadline,
        mint_signature: Buffer.from(params.mintSignature),
      });

      const assembledTx = await tx.simulate();
      // Fail loudly on simulation errors instead of submitting a malformed tx.
      assertSimulationSucceeded(assembledTx, 'create_rwa_token');
      this.logger.debug('create_rwa_token simulation', {
        hasBuilt: !!assembledTx.built,
        fee: assembledTx.built?.fee,
      });

      // The simulation produces address credentials for the shipper's
      // require_auth. Since the shipper is the tx source (signed at the
      // envelope level by DFNS), rewrite them to source-account credentials.
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'create_rwa_token transaction prepared',
        data: {
          txXdr,
          tokenId,
          predictedTokenAddress: params.predictedTokenAddress,
          raiseAmount: raiseAmount.toString(),
          interestBps: interestBps.toString(),
          dueLedger: params.dueLedger,
          deadline: params.deadline,
          nonce: params.nonce.toString(),
          salt: Buffer.from(params.salt).toString('hex'),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareCreateRwaToken', error);
      throw error;
    }
  }

  /**
   * Prepare the USDC `approve` the shipper must sign BEFORE `create_rwa_token`.
   *
   * `create_rwa_token` pulls the upfront interest + protocol fee from the
   * shipper via `transfer_from`, which requires the shipper to have approved
   * the factory as a spender. Soroban permits only one host-function op per
   * transaction, so this must be a separate transaction signed first.
   *
   * The approved amount mirrors the contract exactly:
   *   upfront = raise_amount * (interest_bps + protocol_fee_bps) / 10_000
   * computed from the SAME raise amount passed to `create_rwa_token` so the
   * allowance always covers the pull.
   */
  async prepareApproveFactory(
    shipperAddress: string,
    payload: CreateRwaTokenDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      const raiseAmount = BigInt(payload.raiseAmount);
      const interestBps = BigInt(payload.interestBps);
      const protoBps = await this.blockchain.getProtocolFeeBps();

      const upfront = (raiseAmount * (interestBps + protoBps)) / 10_000n;

      const factoryAddress = this.blockchain.factoryContractAddress;
      const latestLedger = await this.blockchain.getLatestLedger();
      const expirationLedger = latestLedger + LEDGERS_PER_DAY;

      this.logger.debug('Preparing approve (factory as USDC spender)', {
        shipperAddress,
        upfront: upfront.toString(),
        expirationLedger,
      });

      const txXdr = await this.blockchain.buildApproveTx({
        ownerAddress: shipperAddress,
        spenderAddress: factoryAddress,
        amount: upfront,
        expirationLedger,
      });

      return {
        success: true,
        message: 'approve transaction prepared',
        data: {
          txXdr,
          spender: factoryAddress,
          amount: upfront.toString(),
          expirationLedger,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareApproveFactory', error);
      throw error;
    }
  }

  /**
   * Prepare a `collect_fund` invocation for the shipper.
   * Returns the assembled transaction XDR for DFNS signing.
   */
  async prepareCollectFund(
    rwaId: string,
    shipperAddress: string,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Preparing collect_fund', { rwaId, shipperAddress });

      // collect_fund calls shipper.require_auth(), so the shipper must be the tx
      // source (signed at the envelope level by DFNS). Build with the shipper
      // factory — using the admin-signer factory makes the admin the source and
      // the shipper's require_auth can never be satisfied (Auth, InvalidAction).
      const shipperFactory = this.blockchain.factoryForShipper(shipperAddress);
      const tx = await shipperFactory.collect_fund({
        rwa_id: rwaId,
        shipper: shipperAddress,
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'collect_fund');
      // Rewrite the shipper's address-credential auth to source-account
      // credentials, satisfied by the DFNS envelope signature.
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'collect_fund transaction prepared',
        data: { txXdr, rwaId, shipper: shipperAddress },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareCollectFund', error);
      throw error;
    }
  }

  /**
   * Prepare a `settle_debt` invocation for the shipper.
   * Returns the assembled transaction XDR for DFNS signing.
   */
  async prepareSettleDebt(
    rwaId: string,
    shipperAddress: string,
    payload: SettleDebtDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Preparing settle_debt', {
        rwaId,
        shipperAddress,
        amount: payload.principalAmount,
      });

      const principalAmount = BigInt(payload.principalAmount);

      // settle_debt calls shipper.require_auth(), so the shipper must be the tx
      // source (signed at the envelope level by DFNS). Build with the shipper
      // factory so the require_auth resolves to the source account rather than
      // the admin (which would fail with Auth, InvalidAction).
      const shipperFactory = this.blockchain.factoryForShipper(shipperAddress);
      const tx = await shipperFactory.settle_debt({
        rwa_id: rwaId,
        shipper: shipperAddress,
        principal_amount: principalAmount as any,
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'settle_debt');
      // Rewrite the shipper's address-credential auth to source-account
      // credentials, satisfied by the DFNS envelope signature.
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'settle_debt transaction prepared',
        data: {
          txXdr,
          rwaId,
          shipper: shipperAddress,
          principalAmount: principalAmount.toString(),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareSettleDebt', error);
      throw error;
    }
  }

  /**
   * Prepare a generic USDC `approve(caller → factory, amount)` transaction.
   * Required before `buy_shares` (investor) and `settle_debt` (shipper), both of
   * which pull USDC from the caller via `transfer_from`.
   */
  async prepareApprove(
    ownerAddress: string,
    amountRaw: string,
  ): Promise<SuccessResponseDTO> {
    try {
      const amount = BigInt(amountRaw);
      const factoryAddress = this.blockchain.factoryContractAddress;
      const latestLedger = await this.blockchain.getLatestLedger();
      const expirationLedger = latestLedger + LEDGERS_PER_DAY;

      this.logger.debug('Preparing approve (factory as USDC spender)', {
        ownerAddress,
        amount: amount.toString(),
        expirationLedger,
      });

      const txXdr = await this.blockchain.buildApproveTx({
        ownerAddress,
        spenderAddress: factoryAddress,
        amount,
        expirationLedger,
      });

      return {
        success: true,
        message: 'approve transaction prepared',
        data: {
          txXdr,
          spender: factoryAddress,
          amount: amount.toString(),
          expirationLedger,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareApprove', error);
      throw error;
    }
  }

  /**
   * Prepare a `buy_shares` invocation for an investor. The investor must have
   * already approved the factory to pull `amount` USDC (see `prepareApprove`).
   * Returns the assembled transaction XDR for DFNS signing (investor as source).
   */
  async prepareBuyShares(
    rwaId: string,
    investorAddress: string,
    amountRaw: string,
  ): Promise<SuccessResponseDTO> {
    try {
      const amount = BigInt(amountRaw);
      this.logger.debug('Preparing buy_shares', {
        rwaId,
        investorAddress,
        amount: amount.toString(),
      });

      const investorFactory =
        this.blockchain.factoryForShipper(investorAddress);
      const tx = await investorFactory.buy_shares({
        rwa_id: rwaId,
        investor: investorAddress,
        amount: amount as any,
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'buy_shares');
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'buy_shares transaction prepared',
        data: {
          txXdr,
          rwaId,
          investor: investorAddress,
          amount: amount.toString(),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareBuyShares', error);
      throw error;
    }
  }

  /**
   * Prepare a `claim` invocation for an investor. Reads the offering's token
   * address on-chain, signs an admin burn permit over the claimed allocation,
   * and assembles the transaction (investor as source). The offering must be
   * `Settled` for this to simulate successfully.
   */
  async prepareClaim(
    rwaId: string,
    investorAddress: string,
    amountRaw: string,
  ): Promise<SuccessResponseDTO> {
    try {
      const amount = BigInt(amountRaw);
      this.logger.debug('Preparing claim', {
        rwaId,
        investorAddress,
        amount: amount.toString(),
      });

      // The burn permit is signed over the offering's SEP57 token contract.
      const rwaTx = await this.blockchain.factory.get_rwa({ rwa_id: rwaId });
      const rwa = (await rwaTx.simulate()).result as unknown as RWA;
      const tokenAddress = rwa.token;

      const { nonce, deadline, burnSignature } =
        await this.blockchain.prepareClaimParams({
          tokenAddress,
          investorAddress,
          amount,
        });

      const investorFactory =
        this.blockchain.factoryForShipper(investorAddress);
      const tx = await investorFactory.claim({
        rwa_id: rwaId,
        investor: investorAddress,
        amount: amount as any,
        nonce,
        deadline,
        burn_signature: Buffer.from(burnSignature),
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'claim');
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'claim transaction prepared',
        data: {
          txXdr,
          rwaId,
          investor: investorAddress,
          amount: amount.toString(),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareClaim', error);
      throw error;
    }
  }

  /**
   * Submit a signed Soroban transaction (after DFNS signing on the frontend).
   * Delegates to BlockchainService for XDR decode + RPC send.
   */
  async submitSignedTransaction(
    signedTxXdr: string,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Submitting signed Soroban transaction');

      const result = await this.blockchain.submitTransaction(signedTxXdr);

      return {
        success: true,
        message: 'Transaction submitted to Soroban RPC',
        data: {
          hash: result.hash,
          status: result.status,
          errorResult: result.errorResultXdr,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in submitSignedTransaction', error);
      throw error;
    }
  }

  /** List transaction events for the current user (as shipper or investor). */
  async listEvents(
    userId: string,
    isShipper: boolean,
    shipperRwaIds?: string[],
    investorAddress?: string,
  ): Promise<SuccessResponseDTO> {
    try {
      let events: any[] = [];

      if (isShipper && shipperRwaIds && shipperRwaIds.length > 0) {
        events = await this.rwaRepository.findEventsByShipper(shipperRwaIds);
      }
      if (investorAddress) {
        const investorEvents =
          await this.rwaRepository.findEventsByInvestor(investorAddress);
        events = [...events, ...investorEvents];
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      return {
        success: true,
        message: 'Transaction events retrieved successfully',
        data: { items: unique },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in listEvents', error);
      throw error;
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  /**
   * Normalise an RWA's `investors` field into `[address, shares]` pairs.
   *
   * The SDK decodes the on-chain map inconsistently depending on the binding —
   * observed as an **array of `[address, i128]` tuples** (indexed object),
   * but it can also surface as a real `Map` or an address-keyed object. Handle
   * all three so holdings are read reliably.
   */
  private investorEntries(rwa: RWA): Array<[string, bigint]> {
    const inv = rwa.investors as unknown;
    if (!inv) return [];

    const out: Array<[string, bigint]> = [];
    if (inv instanceof Map) {
      for (const [k, v] of inv.entries()) {
        out.push([String(k), BigInt(v)]);
      }
      return out;
    }

    const values = Array.isArray(inv)
      ? inv
      : Object.values(inv as Record<string, unknown>);
    // Array/indexed-object of [address, amount] tuples.
    if (values.every((e) => Array.isArray(e) && e.length >= 2)) {
      for (const entry of values as unknown[][]) {
        out.push([String(entry[0]), BigInt(entry[1] as string)]);
      }
      return out;
    }

    // Fallback: plain object keyed by address.
    for (const [k, v] of Object.entries(inv as Record<string, unknown>)) {
      out.push([k, BigInt(v as string)]);
    }
    return out;
  }

  /** Read an investor's share holding from an RWA's `investors` map. */
  private investorHolding(rwa: RWA, address: string): bigint {
    for (const [addr, shares] of this.investorEntries(rwa)) {
      if (addr === address) return shares;
    }
    return 0n;
  }

  /**
   * True when the address appears in the RWA's on-chain investors map at all —
   * including a fully-claimed position whose balance is now 0. Used by the
   * "My investment" list so bought-then-claimed offerings still show up.
   */
  private investorHasEntry(rwa: RWA, address: string): boolean {
    return this.investorEntries(rwa).some(([addr]) => addr === address);
  }

  /**
   * Approximate the calendar date a future ledger will close at. Stellar
   * ledgers close roughly every 5 seconds, so we project from the current
   * ledger. Returns null if the current ledger can't be resolved.
   */
  private async dueLedgerToDate(dueLedger: number): Promise<string | null> {
    if (!dueLedger || Number.isNaN(dueLedger)) return null;
    try {
      const current = await this.blockchain.getLatestLedger();
      const LEDGER_CLOSE_SECONDS = 5;
      const secondsUntilDue = (dueLedger - current) * LEDGER_CLOSE_SECONDS;
      return new Date(Date.now() + secondsUntilDue * 1000).toISOString();
    } catch (error) {
      this.logger.warn('Could not resolve current ledger for due date', error);
      return null;
    }
  }

  private parseRwaStruct(rwa: RWA): Record<string, unknown> {
    // `investors` is an on-chain map of address → shares. Expose both the count
    // and the per-address holdings so an investor can see (and claim) their
    // own allocation from the details page.
    const investorHoldings: Record<string, string> = {};
    for (const [addr, shares] of this.investorEntries(rwa)) {
      investorHoldings[addr] = shares.toString();
    }
    const investorCount = Object.keys(investorHoldings).length;

    return {
      id: rwa.id,
      shipper: rwa.shipper,
      token: rwa.token,
      status: this.mapRwaStatus(rwa.status),
      raiseAmount: rwa.raise_amount.toString(),
      interestBps: Number(rwa.interest_bps),
      interestPool: rwa.interest_pool.toString(),
      principalPool: rwa.principal_pool.toString(),
      protocolFeeBps: Number(rwa.protocol_fee_bps),
      protocolFeePool: rwa.protocol_fee_pool.toString(),
      sharesBought: rwa.shares_bought.toString(),
      sharesTotal: rwa.shares_total.toString(),
      sharesReserved: rwa.shares_reserved.toString(),
      dueLedger: Number(rwa.due_ledger),
      investors: investorCount,
      investorHoldings,
    };
  }

  private mapRwaStatus(status: RWAStatus): string {
    switch (status) {
      case RWAStatus.Open:
        return 'Open';
      case RWAStatus.Funded:
        return 'Funded';
      case RWAStatus.Settled:
        return 'Settled';
      default:
        return 'Unknown';
    }
  }
}
