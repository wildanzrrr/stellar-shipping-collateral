export type UserRoleValue = 'INVESTOR' | 'SHIPPING_COMPANY';

export type KycStatusValue =
  'NOT_STARTED' | 'INIT' | 'PENDING' | 'COMPLETED' | 'REJECTED' | 'ON_HOLD';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: UserRoleValue;
  kycStatus: KycStatusValue; // mirrors User.kycStatus for FE gating
  walletId?: string; // DFNS wallet id
  walletAddress?: string; // Stellar address
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  type: 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token lifetime in seconds
}

// Shape attached to the request by JwtAuthGuard.
export interface AuthenticatedRequest {
  user: AccessTokenPayload;
}
