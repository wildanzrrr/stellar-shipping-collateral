import type { DefaultSession } from "next-auth"
import type { UserRole } from "@/lib/api"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    error?: "RefreshTokenError"
    user: {
      id?: string
      role?: UserRole
      firstName?: string | null
      lastName?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role?: UserRole
    firstName?: string | null
    lastName?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role?: UserRole
    firstName?: string | null
    lastName?: string | null
    error?: "RefreshTokenError"
  }
}
