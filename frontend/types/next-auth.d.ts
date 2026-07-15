import type { DefaultSession } from "next-auth"
import type { KycStatus, KybStatus, UserRole } from "@/lib/api"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    error?: "RefreshTokenError"
    user: {
      id?: string
      role?: UserRole
      kycStatus?: KycStatus
      kybStatus?: KybStatus
      firstName?: string | null
      lastName?: string | null
      walletId?: string | null
      walletAddress?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role?: UserRole
    kycStatus?: KycStatus
    kybStatus?: KybStatus
    firstName?: string | null
    lastName?: string | null
    walletId?: string | null
    walletAddress?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role?: UserRole
    kycStatus?: KycStatus
    kybStatus?: KybStatus
    firstName?: string | null
    lastName?: string | null
    walletId?: string | null
    walletAddress?: string | null
    error?: "RefreshTokenError"
  }
}
