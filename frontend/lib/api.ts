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

export interface CreateRwaTokenPayload {
  tokenId: string
  raiseAmount: string
  interestBps: string
  dueDays: number
  name: string
  symbol: string
}

export const collateralApi = {
  create: (
    accessToken: string,
    body: {
      rwaId: string
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
  uploadDocument: async (
    accessToken: string,
    collateralId: string,
    file: File,
    documentType: DocumentTypeKey
  ): Promise<{
    id: string
    documentType: DocumentTypeKey
    fileName: string
    fileHash: string
    gcsUri: string
  }> => {
    const form = new FormData()
    form.append("file", file)
    form.append("documentType", documentType)
    const r = await fetch(
      `${base}/collateral/${encodeURIComponent(collateralId)}/documents`,
      {
        method: "POST",
        headers: bearer(accessToken),
        body: form,
      }
    )
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
    const json = (await r.json()) as Wrapped<{
      id: string
      documentType: DocumentTypeKey
      fileName: string
      fileHash: string
      gcsUri: string
    }>
    return json.data
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
