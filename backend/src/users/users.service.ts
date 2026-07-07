import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { DfnsService } from 'src/dfns/dfns.service';
import { SuccessResponseDTO } from 'src/utils/dto';
import {
  RegisterInitDTO,
  RegisterCompleteDTO,
  LoginInitDTO,
  LoginCompleteDTO,
} from './users.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly dfns: DfnsService,
  ) {}

  async registerInit(payload: RegisterInitDTO): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Register init', { username: payload.username });

      // Check if user already exists and is fully registered
      const existing = await this.usersRepository.getByUsername(
        payload.username,
      );
      if (existing?.dfnsUserId) {
        return {
          success: true,
          message: 'User already registered',
          data: { user: existing, alreadyRegistered: true },
          statusCode: HttpStatus.OK,
        };
      }

      // Try to look up an existing DFNS end user for this username first.
      // Otherwise every BE restart creates a brand-new DFNS user.
      let dfnsUserId: string | undefined;
      try {
        const listed: any = await this.dfns.api.auth.listUsers({
          query: { kind: 'EndUser', limit: 100 },
        });
        const items: any[] = listed?.items ?? listed ?? [];
        const found = items.find(
          (u) =>
            u?.username === payload.username || u?.email === payload.username,
        );
        dfnsUserId = found?.id;
      } catch (e: any) {
        this.logger.error('listUsers failed:', e?.message ?? String(e));
      }

      if (dfnsUserId) {
        this.logger.debug(
          `Reusing DFNS user ${dfnsUserId} for ${payload.username}`,
        );
        if (!existing) {
          const user = await this.usersRepository.create(payload.username);
          await this.usersRepository.update(user.id, { dfnsUserId });
        } else {
          await this.usersRepository.update(existing.id, { dfnsUserId });
        }
        return {
          success: true,
          message: 'User already registered',
          data: { alreadyRegistered: true },
          statusCode: HttpStatus.OK,
        };
      }

      // Create new DFNS user
      const challenge =
        await this.dfns.api.auth.createDelegatedRegistrationChallenge({
          body: { email: payload.username, kind: 'EndUser' },
        });

      if (!existing) {
        await this.usersRepository.create(payload.username);
      }

      return {
        success: true,
        message: 'Registration challenge created',
        data: challenge,
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in registerInit', error);
      throw error;
    }
  }

  async registerComplete(
    payload: RegisterCompleteDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Register complete', { username: payload.username });

      const tempClient = this.dfns.forUserToken(
        payload.temporaryAuthenticationToken,
      );

      const result: any = await tempClient.auth.register({
        body: {
          firstFactorCredential: payload.firstFactorCredential as any,
        },
      });

      const userId = result?.user?.id ?? result?.id;
      const user = await this.usersRepository.getByUsername(payload.username);
      if (user && userId) {
        await this.usersRepository.update(user.id, { dfnsUserId: userId });
      }

      return {
        success: true,
        message: 'User registered successfully',
        data: result,
        statusCode: HttpStatus.CREATED,
      };
    } catch (error) {
      this.logger.error('Error in registerComplete', error);
      throw error;
    }
  }

  async loginInit(payload: LoginInitDTO): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Login init', { username: payload.username });

      const challenge = await this.dfns.api.auth.createLoginChallenge({
        body: {
          username: payload.username,
          orgId: this.dfns.orgId,
        },
      });

      return {
        success: true,
        message: 'Login challenge created',
        data: challenge,
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in loginInit', error);
      throw error;
    }
  }

  async loginComplete(payload: LoginCompleteDTO): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Login complete', { username: payload.username });

      const tempClient = this.dfns.forUserToken(
        payload.temporaryAuthenticationToken,
      );

      const res: any = await tempClient.auth.login({
        body: {
          challengeIdentifier: payload.challengeIdentifier,
          firstFactor: payload.firstFactor,
        } as any,
      });

      const user = await this.usersRepository.getByUsername(payload.username);
      if (user && res?.token) {
        await this.usersRepository.update(user.id, {
          userAuthToken: res.token,
        });
      }

      return {
        success: true,
        message: 'Login successful',
        data: res,
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in loginComplete', error);
      throw error;
    }
  }
}
