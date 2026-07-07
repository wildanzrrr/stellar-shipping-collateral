import { Body, Controller, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { DfnsService } from '../dfns/dfns.service';

interface RegisterDto {
  username: string;
}

interface CompleteRegistrationDto {
  username: string;
  temporaryAuthenticationToken: string;
  firstFactorCredential: unknown;
}

interface LoginDto {
  username: string;
}

interface CompleteLoginDto {
  username: string;
  temporaryAuthenticationToken: string;
  firstFactor: unknown;
  challengeIdentifier: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly dfns: DfnsService,
  ) {}

  /**
   * Step 1 of delegated registration.
   * SA calls DFNS → returns a challenge the browser signs with a passkey.
   * Also provisions a fresh AppUser on our side.
   */
  @Post('register/init')
  async registerInit(@Body() body: RegisterDto) {
    const existing = this.users.byUsername_(body.username);
    if (existing?.dfnsUserId) {
      return { alreadyRegistered: true, user: existing };
    }

    // Try to look up an existing DFNS end user for this email first.
    // Otherwise every BE restart creates a brand-new DFNS user → needs new perms.
    let dfnsUserId: string | undefined;
    try {
      const listed: any = await this.dfns.api.auth.listUsers({
        query: { kind: 'EndUser', limit: 100 },
      });
      const items: any[] = listed?.items ?? listed ?? [];
      const found = items.find(
        (u) => u?.username === body.username || u?.email === body.username,
      );
      dfnsUserId = found?.id;
    } catch (e: any) {
      console.log('[register/init] listUsers failed:', e?.message ?? String(e));
    }

    if (dfnsUserId) {
      console.log(
        `[register/init] reusing DFNS user ${dfnsUserId} for ${body.username}`,
      );
      if (!existing) this.users.create(body.username);
      this.users.update(this.users.byUsername_(body.username)!.id, {
        dfnsUserId,
      });
      return {
        alreadyRegistered: true,
        user: this.users.byUsername_(body.username),
      };
    }

    const challenge =
      await this.dfns.api.auth.createDelegatedRegistrationChallenge({
        body: { email: body.username, kind: 'EndUser' },
      });

    if (!existing) this.users.create(body.username);
    return challenge;
  }

  /**
   * Step 2 of delegated registration.
   * FE posts the temp token (from init) + the signed passkey attestation.
   */
  @Post('register/complete')
  async registerComplete(@Body() body: CompleteRegistrationDto) {
    const tempClient = this.dfns.forUserToken(
      body.temporaryAuthenticationToken,
    );

    const result: any = await tempClient.auth.register({
      body: { firstFactorCredential: body.firstFactorCredential as any },
    });

    const userId = result?.user?.id ?? result?.id;
    const u = this.users.byUsername_(body.username);
    if (u) this.users.update(u.id, { dfnsUserId: userId });

    return result;
  }

  /** Step 1 of login. */
  @Post('login/init')
  async loginInit(@Body() body: LoginDto) {
    return this.dfns.api.auth.createLoginChallenge({
      body: { username: body.username, orgId: this.dfns.orgId },
    });
  }

  /** Step 2 of login. FE posts the temp token + signed challenge. */
  @Post('login/complete')
  async loginComplete(@Body() body: CompleteLoginDto) {
    const tempClient = this.dfns.forUserToken(
      body.temporaryAuthenticationToken,
    );

    const res: any = await tempClient.auth.login({
      body: {
        challengeIdentifier: body.challengeIdentifier,
        firstFactor: body.firstFactor,
      } as any,
    });

    const u = this.users.byUsername_(body.username);
    if (u) this.users.update(u.id, { userAuthToken: res?.token });
    return res;
  }
}
