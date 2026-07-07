import { Injectable } from '@nestjs/common';

export interface AppUser {
  /** your internal user id */
  id: string;
  /** username used as the DFNS delegated registration "email" */
  username: string;
  /** DFNS user id (assigned after registration completes) */
  dfnsUserId?: string;
  /** end-user auth token from DFNS login */
  userAuthToken?: string;
  /** id of the wallet created for this user */
  walletId?: string;
  walletAddress?: string;
  /** message we last asked the user to sign */
  lastMessage?: string;
  /** hex xdr of the unsigned transaction we last asked the user to sign */
  lastTxXdr?: string;
}

/** In-memory user store — replace with a real DB in production. */
@Injectable()
export class UsersService {
  private byId = new Map<string, AppUser>();
  private byUsername = new Map<string, AppUser>();

  byUsername_(username: string): AppUser | undefined {
    return this.byUsername.get(username);
  }

  get(id: string): AppUser | undefined {
    return this.byId.get(id);
  }

  create(username: string): AppUser {
    const id = `u_${Math.random().toString(36).slice(2, 10)}`;
    const u: AppUser = { id, username };
    this.byId.set(id, u);
    this.byUsername.set(username, u);
    return u;
  }

  update(id: string, patch: Partial<AppUser>): AppUser {
    const u = this.byId.get(id);
    if (!u) throw new Error(`user ${id} not found`);
    Object.assign(u, patch);
    return u;
  }
}
