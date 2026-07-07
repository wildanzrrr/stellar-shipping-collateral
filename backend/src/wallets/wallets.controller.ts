import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DfnsApiClient, DfnsDelegatedApiClient } from '@dfns/sdk';
import {
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { UsersService } from '../users/users.service';
import { DfnsService } from '../dfns/dfns.service';

const HORIZON_URL =
  process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL =
  process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org';
const horizon = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.TESTNET;

async function fundTestnetAccount(address: string) {
  const res = await fetch(
    `${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`friendbot failed: ${res.status} ${text}`);
  }
  return res.json();
}

interface CreateWalletDto {
  username: string;
}

interface DelegateDto {
  username: string;
  walletId: string;
}

interface SignInitDto {
  username: string;
  message: string;
}

interface SignCompleteDto {
  username: string;
  challengeIdentifier: string;
  firstFactor: unknown;
}

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly users: UsersService,
    private readonly dfns: DfnsService,
    private readonly config: ConfigService,
  ) {}

  /** Create a Stellar Testnet wallet (owned by the service account). */
  @Post()
  async create(@Body() body: CreateWalletDto) {
    const u = this.users.byUsername_(body.username);
    if (!u) throw new NotFoundException('user not registered');

    if (u.walletId) {
      return {
        id: u.walletId,
        address: u.walletAddress,
        network: 'StellarTestnet',
      };
    }

    const wallet: any = await this.dfns.api.wallets.createWallet({
      body: {
        network: 'StellarTestnet',
        name: `${u.username}-stellar`,
        delayDelegation: true,
      } as any,
    });

    this.users.update(u.id, {
      walletId: wallet.id,
      walletAddress: wallet.address,
    });

    // Fund on testnet so the account exists on Horizon (needed to fetch seq#).
    try {
      await fundTestnetAccount(wallet.address);
    } catch (e: any) {
      // Non-fatal — sign init will retry.
      console.warn('friendbot funding failed (non-fatal):', e?.message);
    }

    return { id: wallet.id, address: wallet.address, network: wallet.network };
  }

  /** Delegate an SA-owned wallet to the end user. */
  @Post(':walletId/delegate')
  async delegate(
    @Param('walletId') walletId: string,
    @Body() body: DelegateDto,
  ) {
    const u = this.users.byUsername_(body.username);
    if (!u?.dfnsUserId) throw new NotFoundException('user not registered');

    const res: any = await this.dfns.api.wallets.delegateWallet({
      walletId,
      body: { userId: u.dfnsUserId },
    });
    return res;
  }

  /**
   * Step 1 of message signing — builds a Stellar transaction containing the
   * message in a `manageData` op and requests a signing challenge.
   * (Stellar on DFNS only supports `kind: Transaction` — no generic Message kind.)
   */
  @Post(':walletId/sign/init')
  async signInit(
    @Param('walletId') walletId: string,
    @Body() body: SignInitDto,
  ) {
    const u = this.users.byUsername_(body.username);
    if (!u) throw new NotFoundException('user not registered');
    if (!u.userAuthToken) throw new Error('user not logged in');
    if (!u.walletAddress) throw new Error('wallet not created');

    const wallet: any = await this.dfns.api.wallets.getWallet({ walletId });
    const keyId = wallet.signingKey?.id;
    if (!keyId) throw new Error('wallet has no signing key');

    // Build a no-op Stellar transaction whose `manageData` op carries the message.
    // Anyone can verify this signature against the resulting signed transaction XDR.
    let account;
    try {
      account = await horizon.loadAccount(u.walletAddress);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        // Account not funded yet (testnet only) — top up via friendbot and retry.
        await fundTestnetAccount(u.walletAddress);
        account = await horizon.loadAccount(u.walletAddress);
      } else {
        throw e;
      }
    }
    const messageBytes = Buffer.from(body.message, 'utf8');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.manageData({
          name: 'msg',
          value: messageBytes,
        }),
      )
      .setTimeout(180)
      .build();
    const transactionXdr = '0x' + tx.toEnvelope().toXDR('hex');

    const delegated = this.delegatedClient(u.userAuthToken);
    const challenge: any = await delegated.keys.generateSignatureInit({
      keyId,
      body: {
        kind: 'Transaction',
        transaction: transactionXdr,
        network: 'StellarTestnet',
      } as any,
    });

    this.users.update(u.id, {
      lastMessage: body.message,
      lastTxXdr: transactionXdr,
    });
    return { ...challenge, keyId, transactionXdr };
  }

  /** Step 2 of message signing — completes with the user-signed challenge. */
  @Post(':walletId/sign/complete')
  async signComplete(
    @Param('walletId') walletId: string,
    @Body() body: SignCompleteDto,
  ) {
    const u = this.users.byUsername_(body.username);
    if (!u) throw new NotFoundException('user not registered');
    if (!u.userAuthToken || !u.lastTxXdr)
      throw new Error('no sign in progress');

    const wallet: any = await this.dfns.api.wallets.getWallet({ walletId });
    const keyId = wallet.signingKey?.id;

    const delegated = this.delegatedClient(u.userAuthToken);
    const transactionXdr = u.lastTxXdr;

    const result: any = await delegated.keys.generateSignatureComplete(
      {
        keyId,
        body: {
          kind: 'Transaction',
          transaction: transactionXdr,
          network: 'StellarTestnet',
        } as any,
      },
      {
        challengeIdentifier: body.challengeIdentifier,
        firstFactor: body.firstFactor as any,
      },
    );

    return { ...result, transactionXdr };
  }

  private delegatedClient(userAuthToken: string): DfnsDelegatedApiClient {
    return new DfnsDelegatedApiClient({
      baseUrl: this.config.getOrThrow<string>('DFNS_API_URL'),
      authToken: userAuthToken,
    });
  }
}
