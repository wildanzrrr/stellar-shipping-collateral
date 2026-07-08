export type UserRoleValue = 'INVESTOR' | 'SHIPPING_COMPANY';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: UserRoleValue;
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
