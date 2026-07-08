// Thin client for our own NestJS backend.
// The BE wraps every response as { success, message, data, statusCode };
// helpers below unwrap `.data` for callers.
const base = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:2000"}/api/v1`

type Wrapped<T> = { success: boolean; message: string; data: T; statusCode: number }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) {
    let msg = `${r.status}`
    try {
      const body = await r.json()
      msg = body?.message ?? JSON.stringify(body)
    } catch {
      msg = `${r.status} ${await r.text()}`
    }
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg)
  }
  const json = (await r.json()) as Wrapped<T>
  return (json?.data ?? json) as T
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` }
}

// ---- auth (email + DFNS passkey -> app JWTs) ----

export type UserRole = "INVESTOR" | "SHIPPING_COMPANY"

export const ROLE_LABELS: Record<UserRole, string> = {
  INVESTOR: "Investor",
  SHIPPING_COMPANY: "Shipping Company",
}

export type PublicUser = {
  id: string
  email: string
  role: UserRole
  firstName?: string | null
  lastName?: string | null
}

export type AuthResult = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: PublicUser
}

export const authApi = {
  registerInit: (body: {
    email: string
    role: UserRole
    firstName?: string
    lastName?: string
  }) =>
    req<any>("/auth/register/init", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  registerComplete: (body: {
    email: string
    temporaryAuthenticationToken: string
    firstFactorCredential: unknown
  }) =>
    req<any>("/auth/register/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  loginInit: (email: string) =>
    req<any>("/auth/login/init", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  loginComplete: (body: {
    email: string
    challengeIdentifier: string
    firstFactor: unknown
  }) =>
    req<AuthResult>("/auth/login/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
}

// ---- wallets (protected — pass the session access token) ----

export const walletApi = {
  createWallet: (accessToken: string, username: string) =>
    req<any>("/wallets", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ username }),
    }),
  delegateWallet: (accessToken: string, username: string, walletId: string) =>
    req<any>(`/wallets/${walletId}/delegate`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ username }),
    }),
  signInit: (
    accessToken: string,
    username: string,
    walletId: string,
    message: string,
  ) =>
    req<any>(`/wallets/${walletId}/sign/init`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ username, message }),
    }),
  signComplete: (
    accessToken: string,
    args: {
      username: string
      walletId: string
      challengeIdentifier: string
      firstFactor: unknown
    },
  ) =>
    req<any>(`/wallets/${args.walletId}/sign/complete`, {
      method: "POST",
      headers: bearer(accessToken),
      // walletId travels in the URL — keep it out of the body (whitelist).
      body: JSON.stringify({
        username: args.username,
        challengeIdentifier: args.challengeIdentifier,
        firstFactor: args.firstFactor,
      }),
    }),
}
