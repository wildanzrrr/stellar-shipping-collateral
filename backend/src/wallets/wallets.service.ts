import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DfnsDelegatedApiClient } from '@dfns/sdk';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { WalletsRepository } from './wallets.repository';
import { UsersRepository } from 'src/users/users.repository';
import { DfnsService } from 'src/dfns/dfns.service';
import { SuccessResponseDTO } from 'src/utils/dto';
import {
  DFNS_NETWORK,
  HORIZON_URL,
  FRIENDBOT_URL,
  USDC_ISSUER,
  USDC_ASSET_CODE,
} from 'src/utils/constant';
import { generateCustomId } from 'src/utils/utils';
import {
  CreateWalletDTO,
  DelegateWalletDTO,
  SignInitDTO,
  SignCompleteDTO,
} from './wallets.dto';

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

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly walletsRepository: WalletsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly dfns: DfnsService,
    private readonly config: ConfigService,
  ) {}

  /** Create a Stellar Testnet wallet (owned by the service account). */
  async createWallet(payload: CreateWalletDTO): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Creating wallet', { username: payload.username });

      const user = await this.usersRepository.getByUsername(payload.username);
      if (!user) throw new NotFoundException('User not registered');

      // Check if wallet already exists
      const existing = await this.walletsRepository.getWalletByUserId(user.id);
      if (existing) {
        return {
          success: true,
          message: 'Wallet already exists',
          data: {
            id: existing.dfnsWalletId,
            address: existing.address,
            network: existing.network,
          },
          statusCode: HttpStatus.OK,
        };
      }

      // Create wallet via DFNS
      const wallet: any = await this.dfns.api.wallets.createWallet({
        body: {
          network: DFNS_NETWORK,
          name: `${user.username}-stellar`,
          delayDelegation: true,
        } as any,
      });

      // Persist to DB
      await this.walletsRepository.createWallet({
        id: generateCustomId('wlt'),
        dfnsWalletId: wallet.id,
        address: wallet.address,
        network: wallet.network,
        name: `${user.username}-stellar`,
        signingKeyId: wallet.signingKey?.id,
        user: { connect: { id: user.id } },
      });

      // Fund on testnet so the account exists on Horizon (needed to fetch seq#).
      try {
        await fundTestnetAccount(wallet.address);
      } catch (e: any) {
        // Non-fatal — sign init will retry.
        this.logger.warn('friendbot funding failed (non-fatal):', e?.message);
      }

      return {
        success: true,
        message: 'Wallet created successfully',
        data: {
          id: wallet.id,
          address: wallet.address,
          network: wallet.network,
        },
        statusCode: HttpStatus.CREATED,
      };
    } catch (error) {
      this.logger.error('Error in createWallet', error);
      throw error;
    }
  }

  /** Delegate an SA-owned wallet to the end user. */
  async delegateWallet(
    walletId: string,
    payload: DelegateWalletDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Delegating wallet', {
        walletId,
        username: payload.username,
      });

      const user = await this.usersRepository.getByUsername(payload.username);
      if (!user?.dfnsUserId) {
        throw new NotFoundException('User not registered');
      }

      const res: any = await this.dfns.api.wallets.delegateWallet({
        walletId,
        body: { userId: user.dfnsUserId },
      });

      return {
        success: true,
        message: 'Wallet delegated successfully',
        data: res,
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in delegateWallet', error);
      throw error;
    }
  }

  /**
   * Add a USDC trustline to a freshly-created (still SA-owned) wallet, signed
   * and broadcast by the service account — no passkey needed. Must run *before*
   * delegation, while the SA can still sign for the wallet. Idempotent.
   */
  async addUsdcTrustline(walletId: string, address: string): Promise<void> {
    this.logger.debug('Adding USDC trustline', { walletId, address });

    // Load (and if needed, fund) the account so it exists and has a sequence#.
    let account: Awaited<ReturnType<typeof horizon.loadAccount>>;
    try {
      account = await horizon.loadAccount(address);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        await fundTestnetAccount(address);
        account = await horizon.loadAccount(address);
      } else {
        throw error;
      }
    }

    // Skip if the trustline already exists.
    const alreadyTrusted = account.balances.some(
      (b) =>
        'asset_code' in b &&
        'asset_issuer' in b &&
        b.asset_code === USDC_ASSET_CODE &&
        b.asset_issuer === USDC_ISSUER,
    );
    if (alreadyTrusted) {
      this.logger.debug('USDC trustline already present, skipping');
      return;
    }

    const usdc = new Asset(USDC_ASSET_CODE, USDC_ISSUER);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(180)
      .build();
    const transactionXdr = '0x' + tx.toEnvelope().toXDR('hex');

    // DFNS signs with the wallet's key (authorized by the SA credential) and
    // broadcasts to Stellar Testnet.
    await this.dfns.api.wallets.broadcastTransaction({
      walletId,
      body: { kind: 'Transaction', transaction: transactionXdr },
    });

    this.logger.debug('USDC trustline broadcast submitted', { walletId });
  }

  /**
   * Step 1 of message signing — builds a Stellar transaction containing the
   * message in a `manageData` op and requests a signing challenge.
   * (Stellar on DFNS only supports `kind: Transaction` — no generic Message kind.)
   */
  async signInit(
    walletId: string,
    payload: SignInitDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Sign init', { walletId, username: payload.username });

      const user = await this.usersRepository.getByUsername(payload.username);
      if (!user) throw new NotFoundException('User not registered');
      if (!user.userAuthToken) throw new Error('User not logged in');

      const wallet = await this.walletsRepository.getWalletByUserId(user.id);
      if (!wallet) throw new NotFoundException('Wallet not found');

      const dfnsWallet: any = await this.dfns.api.wallets.getWallet({
        walletId,
      });
      const keyId = dfnsWallet.signingKey?.id;
      if (!keyId) throw new Error('Wallet has no signing key');

      // Build a no-op Stellar transaction whose `manageData` op carries the message.
      let account;
      try {
        account = await horizon.loadAccount(wallet.address);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          // Account not funded yet (testnet only) — top up via friendbot and retry.
          await fundTestnetAccount(wallet.address);
          account = await horizon.loadAccount(wallet.address);
        } else {
          throw e;
        }
      }

      const messageBytes = Buffer.from(payload.message, 'utf8');
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

      const delegated = this.delegatedClient(user.userAuthToken);
      const challenge: any = await delegated.keys.generateSignatureInit({
        keyId,
        body: {
          kind: 'Transaction',
          transaction: transactionXdr,
          network: DFNS_NETWORK,
        } as any,
      });

      // Store sign session in DB
      await this.walletsRepository.createSignSession({
        message: payload.message,
        transactionXdr,
        status: 'initiated',
        wallet: { connect: { id: wallet.id } },
        user: { connect: { id: user.id } },
      });

      return {
        success: true,
        message: 'Signing challenge created',
        data: { ...challenge, keyId, transactionXdr },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in signInit', error);
      throw error;
    }
  }

  /** Step 2 of message signing — completes with the user-signed challenge. */
  async signComplete(
    walletId: string,
    payload: SignCompleteDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Sign complete', {
        walletId,
        username: payload.username,
      });

      const user = await this.usersRepository.getByUsername(payload.username);
      if (!user) throw new NotFoundException('User not registered');
      if (!user.userAuthToken) throw new Error('User not logged in');

      const session = await this.walletsRepository.getActiveSignSession(
        user.id,
      );
      if (!session) throw new Error('No sign in progress');

      const dfnsWallet: any = await this.dfns.api.wallets.getWallet({
        walletId,
      });
      const keyId = dfnsWallet.signingKey?.id;

      const delegated = this.delegatedClient(user.userAuthToken);
      const result: any = await delegated.keys.generateSignatureComplete(
        {
          keyId,
          body: {
            kind: 'Transaction',
            transaction: session.transactionXdr,
            network: DFNS_NETWORK,
          } as any,
        },
        {
          challengeIdentifier: payload.challengeIdentifier,
          firstFactor: payload.firstFactor as any,
        },
      );

      // Update sign session
      await this.walletsRepository.updateSignSession(session.id, {
        status: 'completed',
        signedXdr: result?.signedTransaction ?? null,
      });

      return {
        success: true,
        message: 'Message signed successfully',
        data: { ...result, transactionXdr: session.transactionXdr },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in signComplete', error);
      throw error;
    }
  }

  private delegatedClient(userAuthToken: string): DfnsDelegatedApiClient {
    return new DfnsDelegatedApiClient({
      baseUrl: this.config.getOrThrow<string>('DFNS_API_URL'),
      authToken: userAuthToken,
    });
  }
}
