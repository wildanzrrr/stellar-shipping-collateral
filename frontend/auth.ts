import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { JWT } from "next-auth/jwt"

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:2000"

/**
 * Exchange a valid refresh token for a fresh access/refresh pair via the BE.
 * Called from the `jwt` callback when the access token is about to expire.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error("No refresh token")

    const res = await fetch(`${BACKEND}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    })
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`)

    const json = await res.json()
    const data = json.data ?? json

    return {
      ...token,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + Number(data.expiresIn ?? 900) * 1000,
      error: undefined,
    }
  } catch {
    return { ...token, error: "RefreshTokenError" }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/app/auth" },
  providers: [
    Credentials({
      id: "dfns",
      name: "DFNS Passkey",
      // The passkey ceremony happens client-side; by the time we get here the
      // BE has already issued tokens. `authorize` just validates + forwards them.
      credentials: {
        email: {},
        userId: {},
        role: {},
        kycStatus: {},
        kybStatus: {},
        firstName: {},
        lastName: {},
        walletId: {},
        walletAddress: {},
        accessToken: {},
        refreshToken: {},
        expiresIn: {},
      },
      authorize: (credentials) => {
        if (!credentials?.accessToken || !credentials?.email) return null
        const firstName = (credentials.firstName as string) || null
        const lastName = (credentials.lastName as string) || null
        return {
          id: (credentials.userId as string) || (credentials.email as string),
          email: credentials.email as string,
          name: [firstName, lastName].filter(Boolean).join(" ") || null,
          role:
            (credentials.role as "INVESTOR" | "SHIPPING_COMPANY") || undefined,
          kycStatus:
            (credentials.kycStatus as
              | "NOT_STARTED"
              | "INIT"
              | "PENDING"
              | "COMPLETED"
              | "REJECTED"
              | "ON_HOLD") || "NOT_STARTED",
          kybStatus:
            (credentials.kybStatus as
              | "NOT_STARTED"
              | "INIT"
              | "PENDING"
              | "COMPLETED"
              | "REJECTED"
              | "ON_HOLD") || "NOT_STARTED",
          firstName,
          lastName,
          walletId: (credentials.walletId as string) || null,
          walletAddress: (credentials.walletAddress as string) || null,
          accessToken: credentials.accessToken as string,
          refreshToken: credentials.refreshToken as string,
          accessTokenExpires:
            Date.now() + Number(credentials.expiresIn ?? 900) * 1000,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in — seed the JWT from the authorized user.
      if (user) {
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
        token.accessTokenExpires = user.accessTokenExpires
        token.role = user.role
        token.kycStatus = user.kycStatus
        token.kybStatus = user.kybStatus
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.walletId = user.walletId
        token.walletAddress = user.walletAddress
        return token
      }

      // Still valid (with a 60s safety margin) — reuse.
      // The 60s margin aligns with the proactive refresh timer in
      // useTokenRefresh, which fires ~60s before expiry to avoid races.
      if (
        token.accessTokenExpires &&
        Date.now() < token.accessTokenExpires - 60_000
      ) {
        return token
      }

      // Access token expired — rotate via the BE.
      return refreshAccessToken(token)
    },
    session({ session, token }) {
      session.accessToken = token.accessToken
      session.accessTokenExpires = token.accessTokenExpires
      session.error = token.error
      if (session.user) {
        if (token.sub) session.user.id = token.sub
        session.user.role = token.role
        session.user.kycStatus = token.kycStatus
        session.user.kybStatus = token.kybStatus
        session.user.firstName = token.firstName
        session.user.lastName = token.lastName
        session.user.walletId = token.walletId
        session.user.walletAddress = token.walletAddress
      }
      return session
    },
  },
})
