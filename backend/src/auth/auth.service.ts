import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { UsersRepository } from 'src/users/users.repository';
import { DfnsService } from 'src/dfns/dfns.service';
import { SuccessResponseDTO } from 'src/utils/dto';
import { User } from 'prisma/generated/prisma/client';
import {
  RegisterInitDTO,
  RegisterCompleteDTO,
  LoginInitDTO,
  LoginCompleteDTO,
} from './auth.dto';
import { AuthTokens, RefreshTokenPayload } from './jwt.types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly dfns: DfnsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // --- Registration (email + profile, passkey via DFNS) -------------------

  async registerInit(payload: RegisterInitDTO): Promise<SuccessResponseDTO> {
    this.logger.debug('Register init', { email: payload.email });

    const existing = await this.usersRepository.getByEmail(payload.email);
    if (existing?.dfnsUserId) {
      // Already a full DFNS user — the FE should switch to the login flow.
      return {
        success: true,
        message: 'User already registered',
        data: { alreadyRegistered: true },
        statusCode: HttpStatus.OK,
      };
    }

    // Reuse an existing DFNS EndUser if one exists (BE restarts otherwise
    // create a brand-new DFNS user each time).
    let dfnsUserId: string | undefined;
    try {
      const listed: any = await this.dfns.api.auth.listUsers({
        query: { kind: 'EndUser', limit: 100 },
      });
      const items: any[] = listed?.items ?? listed ?? [];
      const found = items.find(
        (u) => u?.username === payload.email || u?.email === payload.email,
      );
      dfnsUserId = found?.id;
    } catch (e: any) {
      this.logger.error('listUsers failed:', e?.message ?? String(e));
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
      return {
        success: true,
        message: 'User already registered',
        data: { alreadyRegistered: true },
        statusCode: HttpStatus.OK,
      };
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

    const result: any = await tempClient.auth.register({
      body: { firstFactorCredential: payload.firstFactorCredential as any },
    });

    const dfnsUserId = result?.user?.id ?? result?.id;
    const user = await this.usersRepository.getByEmail(payload.email);
    if (user && dfnsUserId) {
      await this.usersRepository.update(user.id, { dfnsUserId });
    }

    // Registration does not yield an auth token — the FE proceeds to log in.
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

    const tempClient = this.dfns.forUserToken(
      payload.temporaryAuthenticationToken,
    );

    const res: any = await tempClient.auth.login({
      body: {
        challengeIdentifier: payload.challengeIdentifier,
        firstFactor: payload.firstFactor,
      } as any,
    });

    const user = await this.usersRepository.getByEmail(payload.email);
    if (!user) throw new NotFoundException('User not found');

    if (res?.token) {
      await this.usersRepository.update(user.id, { userAuthToken: res.token });
    }

    const tokens = await this.issueTokens(user);

    return {
      success: true,
      message: 'Login successful',
      data: {
        ...tokens,
        user: this.publicUser(user),
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

    const tokens = await this.issueTokens(user);

    return {
      success: true,
      message: 'Token refreshed',
      data: { ...tokens, user: this.publicUser(user) },
      statusCode: HttpStatus.OK,
    };
  }

  async me(userId: string): Promise<SuccessResponseDTO> {
    const user = await this.usersRepository.get({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    return {
      success: true,
      message: 'Current user',
      data: this.publicUser(user),
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

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessTtl as unknown as number,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, type: 'refresh' },
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

  private publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
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
