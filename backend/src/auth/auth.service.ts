import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import type { LoginBody, RegisterBody } from '@dfns/sdk/generated/auth';
import { UsersRepository } from 'src/users/users.repository';
import { WalletsRepository } from 'src/wallets/wallets.repository';
import { WalletsService } from 'src/wallets/wallets.service';
import { DfnsService } from 'src/dfns/dfns.service';
import { SuccessResponseDTO } from 'src/utils/dto';
import { User, Wallet } from 'prisma/generated/prisma/client';
import {
  RegisterInitDTO,
  RegisterCompleteDTO,
  LoginInitDTO,
  LoginCompleteDTO,
} from './auth.dto';
import { AuthTokens, RefreshTokenPayload } from './jwt.types';

// Minimal shapes for the DFNS responses we consume (keeps this file free of `any`).
interface DfnsUserListItem {
  id?: string;
  username?: string;
  email?: string;
}
interface DfnsRegisterResponse {
  user?: { id?: string };
  id?: string;
}
interface WalletData {
  id: string;
  address: string;
  network: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly walletsRepository: WalletsRepository,
    private readonly walletsService: WalletsService,
    private readonly dfns: DfnsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // --- Registration (email + profile, passkey via DFNS) -------------------

  async registerInit(payload: RegisterInitDTO): Promise<SuccessResponseDTO> {
    this.logger.debug('Register init', { email: payload.email });

    const existing = await this.usersRepository.getByEmail(payload.email);
    if (existing?.dfnsUserId) {
      // Already a full DFNS user — reject the registration so the FE can
      // notify the user and prompt them to log in instead.
      throw new BadRequestException('Email already registered');
    }

    // Reuse an existing DFNS EndUser if one exists (BE restarts otherwise
    // create a brand-new DFNS user each time).
    let dfnsUserId: string | undefined;
    try {
      const listed = await this.dfns.api.auth.listUsers({
        query: { kind: 'EndUser', limit: 100 },
      });
      const items = (listed.items ?? []) as unknown as DfnsUserListItem[];
      const found = items.find(
        (u) => u.username === payload.email || u.email === payload.email,
      );
      dfnsUserId = found?.id;
    } catch (error) {
      this.logger.error(
        'listUsers failed:',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Ensure a local user row exists (with profile + role).
    const user =
      existing ??
      (await this.usersRepository.createWithProfile({
        email: payload.email,
        role: payload.role,
        firstName: payload.firstName,
        lastName: payload.lastName,
      }));

    // Keep the role in sync if the account was pre-created without registering.
    if (existing && existing.role !== payload.role) {
      await this.usersRepository.update(existing.id, { role: payload.role });
    }

    if (dfnsUserId) {
      await this.usersRepository.update(user.id, { dfnsUserId });
      await this.provisionWallet(user.id, payload.email);
      // A DFNS EndUser already exists for this email — reject so the FE
      // surfaces an "email already registered" notification.
      throw new BadRequestException('Email already registered');
    }

    const challenge =
      await this.dfns.api.auth.createDelegatedRegistrationChallenge({
        body: { email: payload.email, kind: 'EndUser' },
      });

    return {
      success: true,
      message: 'Registration challenge created',
      data: challenge,
      statusCode: HttpStatus.OK,
    };
  }

  async registerComplete(
    payload: RegisterCompleteDTO,
  ): Promise<SuccessResponseDTO> {
    this.logger.debug('Register complete', { email: payload.email });

    const tempClient = this.dfns.forUserToken(
      payload.temporaryAuthenticationToken,
    );

    const result = (await tempClient.auth.register({
      body: {
        firstFactorCredential:
          payload.firstFactorCredential as RegisterBody['firstFactorCredential'],
      },
    })) as unknown as DfnsRegisterResponse;

    const dfnsUserId = result.user?.id ?? result.id;
    const user = await this.usersRepository.getByEmail(payload.email);
    if (user && dfnsUserId) {
      await this.usersRepository.update(user.id, { dfnsUserId });
      // Provision a delegated, friendbot-funded Stellar wallet linked to the user.
      await this.provisionWallet(user.id, payload.email);
    }

    return {
      success: true,
      message: 'User registered successfully',
      data: { registered: true },
      statusCode: HttpStatus.CREATED,
    };
  }

  // --- Login (passkey via DFNS -> our JWTs) -------------------------------

  async loginInit(payload: LoginInitDTO): Promise<SuccessResponseDTO> {
    this.logger.debug('Login init', { email: payload.email });

    const user = await this.usersRepository.getByEmail(payload.email);
    if (!user?.dfnsUserId) {
      throw new NotFoundException('No account for this email — register first');
    }

    const challenge = await this.dfns.api.auth.createLoginChallenge({
      body: { username: payload.email, orgId: this.dfns.orgId },
    });

    return {
      success: true,
      message: 'Login challenge created',
      data: challenge,
      statusCode: HttpStatus.OK,
    };
  }

  async loginComplete(payload: LoginCompleteDTO): Promise<SuccessResponseDTO> {
    this.logger.debug('Login complete', { email: payload.email });

    // `POST /auth/login` is a public endpoint — the WebAuthn assertion in
    // `firstFactor` *is* the proof of identity, so no temp token is involved.
    const res = await this.dfns.api.auth.login({
      body: {
        challengeIdentifier: payload.challengeIdentifier,
        firstFactor: payload.firstFactor as LoginBody['firstFactor'],
      },
    });

    const user = await this.usersRepository.getByEmail(payload.email);
    if (!user) throw new NotFoundException('User not found');

    const token = 'token' in res ? res.token : undefined;
    if (token) {
      await this.usersRepository.update(user.id, { userAuthToken: token });
    }

    const wallet = await this.walletsRepository.getWalletByUserId(user.id);
    const tokens = await this.issueTokens(user, wallet);

    return {
      success: true,
      message: 'Login successful',
      data: {
        ...tokens,
        user: this.publicUser(user, wallet),
      },
      statusCode: HttpStatus.OK,
    };
  }

  // --- Token rotation -----------------------------------------------------

  async refresh(refreshToken: string): Promise<SuccessResponseDTO> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const user = await this.usersRepository.get({ id: payload.sub });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session revoked');
    }
    if (user.refreshTokenHash !== this.hash(refreshToken)) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    const wallet = await this.walletsRepository.getWalletByUserId(user.id);
    const tokens = await this.issueTokens(user, wallet);

    return {
      success: true,
      message: 'Token refreshed',
      data: { ...tokens, user: this.publicUser(user, wallet) },
      statusCode: HttpStatus.OK,
    };
  }

  async me(userId: string): Promise<SuccessResponseDTO> {
    const user = await this.usersRepository.get({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    const wallet = await this.walletsRepository.getWalletByUserId(user.id);
    return {
      success: true,
      message: 'Current user',
      data: this.publicUser(user, wallet),
      statusCode: HttpStatus.OK,
    };
  }

  async logout(userId: string): Promise<SuccessResponseDTO> {
    await this.usersRepository.update(userId, { refreshTokenHash: null });
    return {
      success: true,
      message: 'Logged out',
      data: { loggedOut: true },
      statusCode: HttpStatus.OK,
    };
  }

  // --- Helpers ------------------------------------------------------------

  /** Create a delegated, friendbot-funded Stellar wallet for the user (idempotent). */
  private async provisionWallet(userId: string, email: string): Promise<void> {
    try {
      const existing = await this.walletsRepository.getWalletByUserId(userId);
      if (existing) return;

      const created = await this.walletsService.createWallet({
        username: email,
      });
      const data = created.data as WalletData | undefined;
      if (data?.id) {
        // Trust USDC while the SA still owns the wallet (before delegation),
        // so it can later be faucet-funded with USDC.
        await this.walletsService.addUsdcTrustline(data.id, data.address);
        await this.walletsService.delegateWallet(data.id, { username: email });
      }
    } catch (error) {
      // Non-fatal: registration succeeds even if wallet provisioning hiccups.
      this.logger.warn(
        `Wallet provisioning failed for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async issueTokens(
    user: User,
    wallet: Wallet | null,
  ): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';

    const claims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
      walletId: wallet?.dfnsWalletId,
      walletAddress: wallet?.address,
    };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl as unknown as number,
    });

    const refreshToken = await this.jwt.signAsync(
      { ...claims, type: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl as unknown as number,
      },
    );

    await this.usersRepository.update(user.id, {
      refreshTokenHash: this.hash(refreshToken),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlToSeconds(accessTtl),
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: User, wallet: Wallet | null) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kycStatus,
      firstName: user.firstName,
      lastName: user.lastName,
      walletId: wallet?.dfnsWalletId ?? null,
      walletAddress: wallet?.address ?? null,
    };
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 60;
    return value * factor;
  }
}
