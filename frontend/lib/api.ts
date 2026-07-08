// Thin client for our own NestJS backend.
// The BE wraps every response as { success, message, data, statusCode };
// helpers below unwrap `.data` for callers.
const base = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:2000"}/api/v1`

interface Wrapped<T> {
  success: boolean
  message: string
  data: T
  statusCode: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) {
    let message = `${r.status}`
    try {
      const body: unknown = await r.json()
      if (body && typeof body === "object" && "message" in body) {
        const m = (body as { message: unknown }).message
        message = Array.isArray(m) ? m.join(", ") : String(m)
      }
    } catch {
      message = `${r.status} ${await r.text()}`
    }
    throw new Error(message)
  }
  const json = (await r.json()) as Wrapped<T>
  return (json?.data ?? (json as unknown as T)) as T
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` }
}

// ---- shared types ----

export type UserRole = "INVESTOR" | "SHIPPING_COMPANY"

export const ROLE_LABELS: Record<UserRole, string> = {
  INVESTOR: "Investor",
  SHIPPING_COMPANY: "Shipping Company",
}

export interface PublicUser {
  id: string
  email: string
  role: UserRole
  firstName?: string | null
  lastName?: string | null
  walletId?: string | null
  walletAddress?: string | null
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: PublicUser
}

export interface RegistrationChallenge {
  temporaryAuthenticationToken: string
  challenge: string
  [key: string]: unknown
}

export type RegisterInitResult = RegistrationChallenge

export interface LoginChallenge {
  challengeIdentifier: string
  challenge: string
  [key: string]: unknown
}

export interface WalletInfo {
  id: string
  address: string
  network: string
}

export interface SignChallenge {
  challengeIdentifier: string
  [key: string]: unknown
}

export interface SignResult {
  signature?: string
  signedTransaction?: string
  [key: string]: unknown
}

// ---- auth (email + DFNS passkey -> app JWTs) ----

export const authApi = {
  registerInit: (body: {
    email: string
    role: UserRole
    firstName?: string
    lastName?: string
  }) =>
    req<RegisterInitResult>("/auth/register/init", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  registerComplete: (body: {
    email: string
    temporaryAuthenticationToken: string
    firstFactorCredential: unknown
  }) =>
    req<{ registered: boolean }>("/auth/register/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  loginInit: (email: string) =>
    req<LoginChallenge>("/auth/login/init", {
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
  me: (accessToken: string) =>
    req<PublicUser>("/auth/me", { headers: bearer(accessToken) }),
}

// ---- wallets (protected — pass the session access token) ----

export const walletApi = {
  createWallet: (accessToken: string, username: string) =>
    req<WalletInfo>("/wallets", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ username }),
    }),
  delegateWallet: (accessToken: string, username: string, walletId: string) =>
    req<unknown>(`/wallets/${walletId}/delegate`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ username }),
    }),
  signInit: (
    accessToken: string,
    username: string,
    walletId: string,
    message: string
  ) =>
    req<SignChallenge>(`/wallets/${walletId}/sign/init`, {
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
    }
  ) =>
    req<SignResult>(`/wallets/${args.walletId}/sign/complete`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({
        username: args.username,
        challengeIdentifier: args.challengeIdentifier,
        firstFactor: args.firstFactor,
      }),
    }),
  transferInit: (
    accessToken: string,
    args: {
      username: string
      walletId: string
      asset: "native" | "USDC"
      destination: string
      amount: number
    }
  ) =>
    req<SignChallenge>(`/wallets/${args.walletId}/transfer/init`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({
        username: args.username,
        asset: args.asset,
        destination: args.destination,
        amount: args.amount,
      }),
    }),
  transferComplete: (
    accessToken: string,
    args: {
      username: string
      walletId: string
      challengeIdentifier: string
      firstFactor: unknown
    }
  ) =>
    req<SignResult>(`/wallets/${args.walletId}/transfer/complete`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({
        username: args.username,
        challengeIdentifier: args.challengeIdentifier,
        firstFactor: args.firstFactor,
      }),
    }),
}
