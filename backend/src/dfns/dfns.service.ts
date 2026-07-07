import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DfnsApiClient } from '@dfns/sdk';
import { makeSigner } from './signer';

@Injectable()
export class DfnsService implements OnModuleInit {
  private readonly logger = new Logger(DfnsService.name);
  private client!: DfnsApiClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const baseUrl = this.config.getOrThrow<string>('DFNS_API_URL');
    const authToken = this.config.getOrThrow<string>(
      'DFNS_SERVICE_ACCOUNT_TOKEN',
    );
    const credId = this.config.getOrThrow<string>(
      'DFNS_SERVICE_ACCOUNT_CRED_ID',
    );
    const pemPath = this.config.get<string>('DFNS_SERVICE_ACCOUNT_PEM_PATH');

    const signer = makeSigner(credId, pemPath);

    this.client = new DfnsApiClient({ baseUrl, authToken, signer });
    this.logger.log(`DfnsApiClient initialised → ${baseUrl}`);
  }

  /** Service-account-scoped DFNS client (full perms on the org's behalf). */
  get api(): DfnsApiClient {
    return this.client;
  }

  /** The DFNS org id from env. Required for delegated login challenges. */
  get orgId(): string {
    return this.config.getOrThrow<string>('DFNS_ORG_ID');
  }

  /**
   * Build a short-lived client scoped to an end-user auth token.
   * Used during registration completion and delegated signing flows.
   * The same AsymmetricKeySigner co-signs user-action challenges.
   */
  forUserToken(userAuthToken: string): DfnsApiClient {
    const baseUrl = this.config.getOrThrow<string>('DFNS_API_URL');
    const credId = this.config.getOrThrow<string>(
      'DFNS_SERVICE_ACCOUNT_CRED_ID',
    );
    const pemPath = this.config.get<string>('DFNS_SERVICE_ACCOUNT_PEM_PATH');
    const signer = makeSigner(credId, pemPath);
    return new DfnsApiClient({ baseUrl, authToken: userAuthToken, signer });
  }
}
