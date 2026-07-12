# Sumsub KYC/KYB Backend Integration

How the NestJS backend integrates with [Sumsub](https://sumsub.com/) to perform identity verification (KYC) and business verification (KYB) on registered users. The backend generates scoped access tokens for the Sumsub WebSDK and receives verification results via signed webhooks.

---

## 1. What is Sumsub?

Sumsub is a KYC/AML verification provider. Two key concepts:

| Concept                | What it is                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Applicant**          | A person being verified. Each applicant has a `userId` (our internal user ID, passed as `externalUserId`) and a `levelName` that defines the verification flow.    |
| **Access Token**       | A short-lived, single-applicant token the backend generates via `POST /resources/accessTokens/sdk`. The frontend WebSDK uses it to launch the verification widget. |
| **Webhook**            | A server-to-server callback Sumsub sends when an applicant's status changes (created, pending, reviewed, rejected, on hold). Signed with HMAC-SHA256.              |
| **Verification Level** | A named configuration in the Sumsub Dashboard that defines which checks to run (ID document, liveness, AML, etc.). Referenced by `SUMSUB_KYC_LEVEL_NAME`.          |

---

## 2. Requirements

### 2.1 Sumsub account setup (one-time, in the Sumsub Dashboard)

1. **Create an account** at [cockpit.sumsub.com](https://cockpit.sumsub.com/) (use Sandbox mode for testing).
2. **Get your App Token + Secret Key**:
   - Dashboard → Settings → API
   - Copy the **App Token** → `SUMSUB_APP_TOKEN`
   - Copy the **Secret Key** → `SUMSUB_SECRET_KEY`
3. **Create a verification level**:
   - Dashboard → Verification Levels → Create
   - Name it (e.g. `basic-kyc`) and configure the required steps (ID document, liveness, etc.)
   - The level **slug** (not display name) goes into `SUMSUB_KYC_LEVEL_NAME`
4. **Set up the webhook**:
   - Dashboard → Webhooks → Add webhook
   - **Endpoint URL**: `https://<your-backend-host>/api/v1/sumsub/webhook` (must be HTTPS, publicly reachable)
   - **Webhook secret**: generate one → `SUMSUB_WEBHOOK_SECRET`
   - Subscribe to at least: `applicantCreated`, `applicantPending`, `applicantOnHold`, `applicantReviewed`

> **Sandbox**: Sumsub uses the same base URL (`https://api.sumsub.com`) for both Sandbox and Production. Switch to Sandbox mode in the Dashboard (toggle upper-right) and use the Sandbox App Token + Secret Key pair.

### 2.2 Local env

`backend/.env`:

```env
SUMSUB_APP_TOKEN=""
SUMSUB_SECRET_KEY=""
SUMSUB_WEBHOOK_SECRET=""
SUMSUB_BASE_URL="https://api.sumsub.com"
SUMSUB_KYC_LEVEL_NAME="basic-kyc"
```

| Variable                | Where to find it                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `SUMSUB_APP_TOKEN`      | Dashboard → Settings → API → App Token                                                |
| `SUMSUB_SECRET_KEY`     | Dashboard → Settings → API → Secret Key                                               |
| `SUMSUB_WEBHOOK_SECRET` | Dashboard → Webhooks → your webhook → secret                                          |
| `SUMSUB_BASE_URL`       | `https://api.sumsub.com` (same for Sandbox and Production — switch mode in Dashboard) |
| `SUMSUB_KYC_LEVEL_NAME` | Dashboard → Verification Levels → KYC level slug                                      |
| `SUMSUB_KYB_LEVEL_NAME` | Dashboard → Verification Levels → KYB level slug (e.g. `registry-aml-check`)          |

### 2.3 Webhook URL requirements

- The webhook endpoint must be **publicly reachable** over **HTTPS**. For local development use a tunnel like `ngrok` or `cloudflared`.
- The backend reads the raw request body for HMAC verification. `main.ts` mounts an explicit Express `raw({ type: '*/*' })` middleware on the webhook route that captures the untouched bytes into `req.rawBody` before JSON parsing. The body is then re-parsed as JSON so the controller still reads `req.body`. Using `useBodyParser('json', { rawBody: true })` alone does **not** populate `req.rawBody` in NestJS 11 / Express 4 — the explicit middleware is required.

---

## 3. Data Model

`prisma/schema.prisma` — additions to the `User` model:

```prisma
enum KycStatus {
  NOT_STARTED
  INIT
  PENDING
  COMPLETED
  REJECTED
  ON_HOLD
}

model User {
  // …existing fields…
  kycStatus            KycStatus @default(NOT_STARTED)
  sumsubApplicantId    String?  @unique
  sumsubExternalUserId String?
  @@index([kycStatus])
}
```

| Field                  | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `kycStatus`            | Current verification state. New users start at `NOT_STARTED`.                     |
| `sumsubApplicantId`    | Sumsub's internal applicant ID (set after first token generation or webhook).     |
| `sumsubExternalUserId` | Our user ID, sent to Sumsub as `externalUserId` when generating the access token. |

### KycStatus lifecycle

```
NOT_STARTED → INIT → PENDING → COMPLETED
                                  ↘ REJECTED
                                  ↘ ON_HOLD → PENDING → …
```

| Status        | Trigger                                                        |
| ------------- | -------------------------------------------------------------- |
| `NOT_STARTED` | Default on registration                                        |
| `INIT`        | Access token generated (applicant created in Sumsub)           |
| `PENDING`     | Webhook `applicantPending` — documents submitted, under review |
| `COMPLETED`   | Webhook `applicantReviewed` with `reviewAnswer = GREEN`        |
| `REJECTED`    | Webhook `applicantReviewed` with `reviewAnswer = RED`          |
| `ON_HOLD`     | Webhook `applicantOnHold` — manual review required             |

---

## 4. Module Wiring

```
src/sumsub/
├── sumsub.module.ts        # imports UsersModule + JwtModule + BlockchainModule, provides SumsubService + JwtAuthGuard
├── sumsub.controller.ts    # POST /sumsub/access-token (guarded)
├── sumsub.dto.ts            # KycAccessTokenDTO, SumsubWebhookPayload
└── sumsub.service.ts        # token generation, webhook handling, HMAC signing/verification + on-chain sync
```

The module self-provides `JwtModule.register({})` and `JwtAuthGuard` to avoid a circular import with `AuthModule` (same pattern as `WalletsModule`). `BlockchainModule` is imported so the webhook handler can call `BlockchainService.syncKycStatus()` / `syncKybStatus()`.

---

## 5. Endpoints

### `POST /api/v1/sumsub/access-token` 🔒

Generates a Sumsub access token scoped to the authenticated user.

- **Auth**: Bearer JWT (guarded by `JwtAuthGuard`)
- **Body** (optional): `{ "sessionId": "...", "applicantId": "..." }`
- **Response**: `{ "token": "...", "userId": "...", "applicantId": "..." }`

The service:

1. Sends `POST /resources/accessTokens/sdk` to Sumsub with a JSON body (`userId`, `levelName`, `ttlInSecs`, `applicantIdentifiers: { email }`) and the HMAC-SHA256 signature header.
2. Sets `userId` (Sumsub external user ID) to the authenticated user's ID.
3. Sets `levelName` from `SUMSUB_KYC_LEVEL_NAME`.
4. Passes `applicantIdentifiers: { email: user.email }` so the WebSDK pre-fills the applicant's email and skips the "enter email" step.
5. If the user's `kycStatus` was `NOT_STARTED`, upgrades it to `INIT`.

### `POST /api/v1/sumsub/webhook` 🔓

Receives Sumsub webhook events. No auth guard — protected by HMAC signature verification.

- **Headers checked**: `x-payload-digest` (preferred) or `x-app-access-sig`
- **Signature**: `HMAC-SHA256(SUMSUB_WEBHOOK_SECRET, rawBody)`
- **Events handled**:
  - `applicantCreated` → `INIT`
  - `applicantPending` → `PENDING`
  - `applicantOnHold` → `ON_HOLD`
  - `applicantReviewed` → `COMPLETED` (if `reviewAnswer = GREEN`) or `REJECTED` (if `RED`)

After the DB is updated for `COMPLETED` or `REJECTED`, the webhook handler calls `BlockchainService.syncKycStatus()` / `syncKybStatus()` to sync the identity to the on-chain `identity-verifier` Soroban contract. On-chain sync is non-blocking — if it fails, the webhook still returns 200 so Sumsub doesn't retry. See [Blockchain Integration](backend.md#blockchain-integration-soroban-identity-verifier) in `docs/backend.md`.

---

## 6. HMAC Signature

### Generating the access token signature

```
ts = Math.floor(Date.now() / 1000)
method = "POST"
endpoint = "/resources/accessTokens/sdk"
body = JSON.stringify({ userId, levelName, ttlInSecs, applicantIdentifiers: { email } })

signature = HMAC-SHA256(SUMSUB_SECRET_KEY, `${ts}${method}${endpoint}${body}`)
header = `v1:${ts}:${signature}`
```

Sent as the `X-App-Access-Sig` header (along with `X-App-Access-Ts` and `X-App-Token`).

### Verifying the webhook signature

```
expected = HMAC-SHA256(SUMSUB_WEBHOOK_SECRET, rawBody)
compare with timingSafeEqual(expected, receivedDigest)
```

The digest is read from the `x-payload-digest` header (Sumsub's standard format), or the `x-app-access-sig` header as a fallback.

---

## 7. Frontend Integration

The frontend uses `@sumsub/websdk-react` to launch the WebSDK:

1. Call `POST /api/v1/sumsub/access-token` (via `sumsubApi.getAccessToken`).
2. Pass the returned `token` to `<SumsubWebSdk accessToken={token} … />`.
3. Listen for `idCheck.onApplicantStatusChanged` and `idCheck.onApplicantVerificationCompleted` messages.
4. The backend webhook is the source of truth for `kycStatus` — the frontend polls `/auth/me` to pick up the update.

---

## 8. KYB — Business Verification (Shipping Companies)

KYB (Know Your Business) is a second verification tier for `SHIPPING_COMPANY` users. Shipping companies **skip KYC entirely** and go straight to KYB, using a separate **Individuals** level (`kyb_registry`) — same level type as KYC but with different checks configured in the Sumsub Dashboard. This avoids the paid Companies / Registry-and-AML-Check feature.

### 8.1 Flow

```
User registers (SHIPPING_COMPANY)
  → Business questionnaire (5 questions about shipping operations)
    → KYB (company registry + AML checks)
      → KYB COMPLETED → can tokenize RWAs

User registers (INVESTOR)
  → Investment questionnaire (5 questions about investor profile)
    → KYC (individual identity verification)
      → KYC COMPLETED → full access
```

Shipping companies skip KYC — they do not need individual identity verification, only business verification. The KYB flow mirrors the KYC flow: a questionnaire phase first, then the Sumsub WebSDK.

### 8.2 Sumsub Dashboard setup

1. Create a **second Individuals verification level** in the Sumsub Dashboard:
   - Dashboard → **Individuals** → Verification Levels → Create
   - Name it `kyb_registry` (the slug goes into `SUMSUB_KYB_LEVEL_NAME`)
   - Configure the checks you want for business verification (e.g. questionnaire, document upload, etc.)
   - This is a regular Individuals level — same type as the KYC level `id-and-liveness`
2. The same webhook endpoint handles both KYC and KYB events — no separate webhook needed.

### 8.3 Webhook routing

KYB events are distinguished from KYC events via the `externalUserId`:

| Flow | `externalUserId` format | Example          |
| ---- | ----------------------- | ---------------- |
| KYC  | `{userId}`              | `usr-abc123`     |
| KYB  | `{userId}:kyb`          | `usr-abc123:kyb` |

The webhook handler in `sumsub.service.ts` checks for the `:kyb` suffix:

- If present → routes to `handleKybWebhook()` which updates `kybStatus` and extracts company info
- If absent → routes to the existing KYC handler which updates `kycStatus`

### 8.4 Data model additions

```prisma
enum KybStatus {
  NOT_STARTED
  INIT
  PENDING
  COMPLETED
  REJECTED
  ON_HOLD
}

model User {
  // …existing KYC fields…
  kybStatus               KybStatus @default(NOT_STARTED)
  sumsubKybApplicantId    String?   @unique
  sumsubKybExternalUserId String?
  companyName              String?
  companyRegistrationNumber String?
  companyCountry           String?
  @@index([kybStatus])
}
```

### 8.5 Endpoints

#### `POST /api/v1/sumsub/kyb-access-token` 🔒

Generates a Sumsub access token for KYB verification.

- **Auth**: Bearer JWT (guarded by `JwtAuthGuard`)
- **Guards**: User must be `SHIPPING_COMPANY` role, `kybStatus` must not be `COMPLETED`. (KYC is **not** required — shipping companies skip KYC entirely.)
- **Body**: none
- **Response**: `{ "token": "...", "externalUserId": "usr-abc:kyb" }`

The service:

1. Sends `POST /resources/accessTokens/sdk` with `userId = "{userId}:kyb"` and `levelName = SUMSUB_KYB_LEVEL_NAME`.
2. If `kybStatus` was `NOT_STARTED`, upgrades it to `INIT`.

#### Webhook (same endpoint as KYC)

KYB webhook events use the same types (`applicantCreated`, `applicantPending`, `applicantReviewed`, etc.) but are routed based on the `:kyb` suffix. When `applicantReviewed` with `reviewAnswer = GREEN` arrives, company info (name, registration number, country) is extracted from the payload and saved to the user record.

### 8.6 Frontend

The frontend has a dedicated KYB page at `/app/profile/kyb`:

1. Calls `sumsubApi.getKybAccessToken(accessToken)` to get the KYB SDK token.
2. Launches `<SumsubWebSdk>` with the KYB token.
3. Polls `/auth/me` to pick up `kybStatus` updates from the webhook.
4. A KYB banner shows below the navbar when KYC is completed but KYB is not.
5. The profile page shows a KYB status badge and business info for shipping companies.

---

## 9. Notes & Gotchas

- **Webhook HTTPS**: Sumsub requires the webhook URL to be HTTPS. Use `ngrok http 2000` for local dev.
- **Raw body**: `main.ts` mounts `raw({ type: '*/*' })` on the `/api/v1/sumsub/webhook` route to capture the exact request bytes into `req.rawBody` before JSON parsing. This is required because `useBodyParser('json', { rawBody: true })` does **not** populate `req.rawBody` in NestJS 11 / Express 4. The HMAC must be computed over the untouched bytes — `JSON.stringify(req.body)` produces different whitespace/key-ordering and will fail verification.
- **Idempotency**: Webhook handlers are idempotent — receiving the same event twice does not corrupt state.
- **Token TTL**: Sumsub access tokens are short-lived (~10 min). The WebSDK's `expirationHandler` fetches a fresh token from the backend when needed.
- **Sandbox vs Production**: Sumsub uses the same base URL (`https://api.sumsub.com`) for both. Switch between Sandbox and Production mode in the Dashboard (toggle upper-right) and use the respective App Token + Secret Key pair.
