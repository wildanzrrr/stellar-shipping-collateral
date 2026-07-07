// Thin client for our own NestJS backend.
const base = process.env.NEXT_PUBLIC_BACKEND_URL!

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  // --- users ---
  registerInit: (username: string) =>
    req<any>("/users/register/init", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  registerComplete: (body: {
    username: string
    temporaryAuthenticationToken: string
    firstFactorCredential: unknown
  }) =>
    req<any>("/users/register/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  loginInit: (username: string) =>
    req<any>("/users/login/init", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  loginComplete: (body: {
    username: string
    temporaryAuthenticationToken: string
    challengeIdentifier: string
    firstFactor: unknown
  }) =>
    req<any>("/users/login/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // --- wallets ---
  createWallet: (username: string) =>
    req<any>("/wallets", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  delegateWallet: (username: string, walletId: string) =>
    req<any>(`/wallets/${walletId}/delegate`, {
      method: "POST",
      body: JSON.stringify({ username, walletId }),
    }),
  signInit: (username: string, walletId: string, message: string) =>
    req<any>(`/wallets/${walletId}/sign/init`, {
      method: "POST",
      body: JSON.stringify({ username, message }),
    }),
  signComplete: (body: {
    username: string
    walletId: string
    challengeIdentifier: string
    firstFactor: unknown
  }) =>
    req<any>(`/wallets/${body.walletId}/sign/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
}
