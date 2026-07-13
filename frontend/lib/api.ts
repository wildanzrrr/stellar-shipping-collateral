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

function bearerJson(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
}

/** SHA-256 of a File/Blob as a 64-char lowercase hex string. */
async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  const bytes = new Uint8Array(digest)
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0")
  }
  return out
}

// ---- shared types ----

export type UserRole = "INVESTOR" | "SHIPPING_COMPANY"

export const ROLE_LABELS: Record<UserRole, string> = {
  INVESTOR: "Investor",
  SHIPPING_COMPANY: "Shipping Company",
}

export type KycStatus =
  "NOT_STARTED" | "INIT" | "PENDING" | "COMPLETED" | "REJECTED" | "ON_HOLD"

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  NOT_STARTED: "Not started",
  INIT: "In progress",
  PENDING: "Pending review",
  COMPLETED: "Verified",
  REJECTED: "Rejected",
  ON_HOLD: "On hold",
}

export type KybStatus =
  "NOT_STARTED" | "INIT" | "PENDING" | "COMPLETED" | "REJECTED" | "ON_HOLD"

export const KYB_STATUS_LABELS: Record<KybStatus, string> = {
  NOT_STARTED: "Not started",
  INIT: "In progress",
  PENDING: "Pending review",
  COMPLETED: "Verified",
  REJECTED: "Rejected",
  ON_HOLD: "On hold",
}

export type QuestionnaireAnswers = Record<string, string | string[]>

export interface PublicUser {
  id: string
  email: string
  role: UserRole
  kycStatus: KycStatus
  kybStatus: KybStatus
  firstName?: string | null
  lastName?: string | null
  walletId?: string | null
  walletAddress?: string | null
  companyName?: string | null
  companyRegistrationNumber?: string | null
  companyCountry?: string | null
  investmentProfile?: QuestionnaireAnswers | null
  businessProfile?: QuestionnaireAnswers | null
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
  submitQuestionnaire: (accessToken: string, answers: QuestionnaireAnswers) =>
    req<{ answers: QuestionnaireAnswers }>("/auth/questionnaire", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ answers }),
    }),
  submitBusinessQuestionnaire: (
    accessToken: string,
    answers: QuestionnaireAnswers
  ) =>
    req<{ answers: QuestionnaireAnswers }>("/auth/business-questionnaire", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ answers }),
    }),
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

// ---- sumsub KYC (protected — pass the session access token) ----

export interface SumsubAccessToken {
  token: string
  userId: string
  applicantId?: string
}

export const sumsubApi = {
  getAccessToken: (
    accessToken: string,
    sessionId?: string,
    applicantId?: string
  ) =>
    req<SumsubAccessToken>("/sumsub/access-token", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ sessionId, applicantId }),
    }),
  getKybAccessToken: (accessToken: string) =>
    req<SumsubAccessToken>("/sumsub/kyb-access-token", {
      method: "POST",
      headers: bearer(accessToken),
    }),
}

// ---- RWA / factory contract (protected) ----

export type RwaStatus = "Open" | "Funded" | "Settled" | "Unknown"

export interface RwaSummary {
  id: string
  shipper: string
  token: string | null
  status: RwaStatus
  raiseAmount: string
  interestBps: number
  sharesBought: string
  sharesTotal: string
  dueLedger: number
  collateral: CollateralRecord | null
}

export interface RwaDetail extends RwaSummary {
  interestPool: string
  principalPool: string
  protocolFeeBps: number
  protocolFeePool: string
  sharesReserved: string
  investors: number
  /** Per-investor holdings keyed by wallet address (token base units). */
  investorHoldings: Record<string, string>
  events: TransactionEvent[]
}

export interface TransactionEvent {
  id: string
  rwaId: string
  eventType: string
  investorAddress: string | null
  amount: string | null
  txHash: string | null
  ledger: number
  createdAt: string
}

export interface PreparedTx {
  txXdr: string
  tokenId?: string
  predictedTokenAddress?: string
  raiseAmount?: string
  interestBps?: string
  dueLedger?: number
  deadline?: number
  nonce?: string
  salt?: string
  rwaId?: string
  shipper?: string
  principalAmount?: string
}

export interface SubmitTxResult {
  hash: string
  status: string
  errorResult: string | null
}

export const rwaApi = {
  list: (accessToken: string, page = 1, limit = 20) =>
    req<{ items: RwaSummary[]; total: number; page: number; limit: number }>(
      `/rwa?page=${page}&limit=${limit}`,
      { headers: bearer(accessToken) }
    ),
  getRwa: (accessToken: string, rwaId: string) =>
    req<RwaDetail>(`/rwa/${encodeURIComponent(rwaId)}`, {
      headers: bearer(accessToken),
    }),
  getInvestors: (accessToken: string, rwaId: string) =>
    req<{ rwaId: string; investors: TransactionEvent[] }>(
      `/rwa/${encodeURIComponent(rwaId)}/investors`,
      { headers: bearer(accessToken) }
    ),
  listEvents: (accessToken: string) =>
    req<{ items: TransactionEvent[] }>(`/rwa/events`, {
      headers: bearer(accessToken),
    }),
  prepareApproveFactory: (accessToken: string, body: CreateRwaTokenPayload) =>
    req<PreparedTx>("/rwa/approve-factory", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify(body),
    }),
  prepareCreateRwaToken: (accessToken: string, body: CreateRwaTokenPayload) =>
    req<PreparedTx>("/rwa/create-token", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify(body),
    }),
  prepareCollectFund: (accessToken: string, rwaId: string) =>
    req<PreparedTx>(`/rwa/${encodeURIComponent(rwaId)}/collect-fund`, {
      method: "POST",
      headers: bearer(accessToken),
    }),
  prepareSettleDebt: (
    accessToken: string,
    rwaId: string,
    principalAmount: string
  ) =>
    req<PreparedTx>(`/rwa/${encodeURIComponent(rwaId)}/settle-debt`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ principalAmount }),
    }),
  /** Generic USDC approve (caller → factory). Precedes buy_shares / settle_debt. */
  prepareApprove: (accessToken: string, amount: string) =>
    req<PreparedTx>("/rwa/approve", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ amount }),
    }),
  prepareBuyShares: (accessToken: string, rwaId: string, amount: string) =>
    req<PreparedTx>(`/rwa/${encodeURIComponent(rwaId)}/buy-shares`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ amount }),
    }),
  prepareClaim: (accessToken: string, rwaId: string, amount: string) =>
    req<PreparedTx>(`/rwa/${encodeURIComponent(rwaId)}/claim`, {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ amount }),
    }),
  submitTransaction: (accessToken: string, signedTxXdr: string) =>
    req<SubmitTxResult>("/rwa/submit", {
      method: "POST",
      headers: bearer(accessToken),
      body: JSON.stringify({ signedTxXdr }),
    }),
}

// ---- collateral (protected) ----

export type CollateralStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "ON_CHAIN"
export type DocumentTypeKey =
  | "COMMERCIAL_INVOICE"
  | "BILL_OF_LADING"
  | "PROOF_OF_DELIVERY"
  | "SHIPPING_CONTRACT"
  | "NOTICE_OF_ASSIGNMENT"

export interface CollateralRecord {
  id: string
  rwaId: string
  tokenAddress: string | null
  status: CollateralStatus
  collateralData: Record<string, unknown> | null
  documents?: CollateralDocument[]
  user?: { id: string; email: string; companyName?: string | null }
  createdAt: string
  updatedAt: string
}

export interface CollateralDocument {
  id: string
  documentType: DocumentTypeKey
  fileName: string
  mimeType: string
  fileHash: string
  gcsUri: string
  createdAt: string
}

/**
 * Extract token name + symbol from a collateral record's `collateralData`.
 * Returns `null` if either field is missing or not a string.
 */
export function getTokenNameSymbol(
  collateral:
    { collateralData: Record<string, unknown> | null } | null | undefined
): { name: string; symbol: string } | null {
  const data = collateral?.collateralData
  if (!data) return null
  const name = data["name"]
  const symbol = data["symbol"]
  if (typeof name !== "string" || typeof symbol !== "string") return null
  if (!name || !symbol) return null
  return { name, symbol }
}

export interface CreateRwaTokenPayload {
  raiseAmount: string
  interestBps: string
  dueDays: number
  name: string
  symbol: string
  /**
   * Reuse a specific on-chain token id. When creating the collateral record
   * first, pass its `rwaId` here so the on-chain token shares the same id.
   * (Ignored by `prepareApproveFactory`.)
   */
  tokenId?: string
}

export const collateralApi = {
  create: (
    accessToken: string,
    body: {
      // Omit to have the backend generate the rwaId (returned in the response).
      rwaId?: string
      tokenAddress?: string
      collateralData?: Record<string, unknown>
    }
  ) =>
    req<{ id: string; rwaId: string; status: CollateralStatus }>(
      "/collateral",
      {
        method: "POST",
        headers: bearer(accessToken),
        body: JSON.stringify(body),
      }
    ),
  list: (accessToken: string, page = 1, limit = 10) =>
    req<{
      items: CollateralRecord[]
      total: number
      page: number
      limit: number
    }>(`/collateral?page=${page}&limit=${limit}`, {
      headers: bearer(accessToken),
    }),
  getById: (accessToken: string, id: string) =>
    req<CollateralRecord>(`/collateral/${encodeURIComponent(id)}`, {
      headers: bearer(accessToken),
    }),
  update: (
    accessToken: string,
    id: string,
    body: {
      tokenAddress?: string
      status?: CollateralStatus
      collateralData?: Record<string, unknown>
    }
  ) =>
    req<{ id: string; rwaId: string; status: CollateralStatus }>(
      `/collateral/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: bearer(accessToken),
        body: JSON.stringify(body),
      }
    ),
  /**
   * Two-step upload (presigned GCS URL):
   *   1. Request an upload URL — backend pre-creates the document row.
   *   2. PUT the file bytes directly to GCS using the returned URL.
   *
   * SHA-256 of the file is computed in the browser and sent to the
   * backend for tamper detection on download.
   */
  uploadDocument: async (
    accessToken: string,
    collateralId: string,
    file: File,
    documentType: DocumentTypeKey,
    onProgress?: (percent: number) => void
  ): Promise<{
    id: string
    documentType: DocumentTypeKey
    fileName: string
    fileHash: string
    gcsUri: string
  }> => {
    // 1. Hash the file in the browser.
    const fileHash = await sha256Hex(file)

    // 2. Request a presigned PUT URL.
    const urlRes = await fetch(
      `${base}/collateral/${encodeURIComponent(collateralId)}/documents/upload-url`,
      {
        method: "POST",
        headers: bearerJson(accessToken),
        body: JSON.stringify({
          documentType,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || "application/octet-stream",
          fileHash,
        }),
      }
    )
    if (!urlRes.ok) {
      throw new Error(
        `Failed to get upload URL: ${urlRes.status} ${await urlRes.text()}`
      )
    }
    const urlJson = (await urlRes.json()) as Wrapped<{
      id: string
      documentType: DocumentTypeKey
      fileName: string
      fileHash: string
      gcsUri: string
      uploadUrl: string
    }>
    const { uploadUrl, ...rest } = urlJson.data

    // 3. PUT the file bytes directly to GCS. The signed URL was bound to
    //    this Content-Type, so we MUST send the matching header. XHR is used
    //    (rather than fetch) so we get real upload-progress events for the
    //    per-document progress bar.
    onProgress?.(0)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", uploadUrl)
      xhr.setRequestHeader(
        "Content-Type",
        file.type || "application/octet-stream"
      )
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress?.(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100)
          resolve()
        } else {
          reject(
            new Error(`GCS upload failed: ${xhr.status} ${xhr.responseText}`)
          )
        }
      }
      xhr.onerror = () =>
        reject(new Error("GCS upload failed: network error"))
      xhr.send(file)
    })

    return rest
  },
  getDocumentUrl: (accessToken: string, collateralId: string, docId: string) =>
    req<{
      id: string
      fileName: string
      signedUrl: string
      expiresInSeconds: number
    }>(
      `/collateral/${encodeURIComponent(collateralId)}/documents/${encodeURIComponent(docId)}`,
      { headers: bearer(accessToken) }
    ),
}
