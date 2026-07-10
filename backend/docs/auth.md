# SEP57 Backend — Authentication

Email-first authentication built on **DFNS delegated custody + passkeys**, issuing our own **JWT access + refresh tokens**. On registration each user is given a role and an auto-provisioned, friendbot-funded Stellar Testnet wallet with a **USDC trustline**.

## Table of Contents

- [Overview](#overview)
- [Data Model](#data-model)
- [Module Wiring](#module-wiring)
- [Endpoints](#endpoints)
- [JWT Design](#jwt-design)
- [Flows](#flows)
  - [Registration](#registration)
  - [Login](#login)
  - [Token Refresh](#token-refresh)
- [Wallet Provisioning & USDC Trustline](#wallet-provisioning--usdc-trustline)
- [Route Protection](#route-protection)
- [Environment](#environment)
- [Notes & Gotchas](#notes--gotchas)

---

## Overview

The auth layer lives in [`src/auth/`](../src/auth). It orchestrates the DFNS passkey ceremony (server-driven, delegated custody) and, on success, mints the app's own tokens so the rest of the API is protected by a plain JWT bearer.

| Concern           | Choice                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| Identity          | Email (also stored as `username` for DFNS)                                    |
| Proof of identity | WebAuthn passkey via DFNS                                                     |
| Session tokens    | App-issued JWT: short-lived **access** + long-lived **refresh**               |
| Authorization     | `role` claim (`INVESTOR` \| `SHIPPING_COMPANY`)                               |
| Wallet            | Auto-created + friendbot-funded + USDC-trustlined + delegated at registration |

Key files:

```
src/auth/
├── auth.module.ts        # imports JwtModule, UsersModule, DfnsModule, WalletsModule
├── auth.controller.ts    # /api/v1/auth/* routes
├── auth.service.ts       # DFNS orchestration + JWT issuance/rotation + wallet provisioning
├── auth.dto.ts           # Register/Login/Refresh DTOs (class-validator)
├── jwt-auth.guard.ts     # Bearer access-token guard -> req.user
└── jwt.types.ts          # AccessTokenPayload / RefreshTokenPayload / AuthTokens
```

---

## Data Model

`User` (see [`prisma/schema.prisma`](../prisma/schema.prisma)) gained the auth/profile fields:

```prisma
enum UserRole {
  INVESTOR
  SHIPPING_COMPANY
}

model User {
  id               String    @id @default(cuid())
  username         String    @unique   // == email (kept for DFNS lookups)
  email            String    @unique
  firstName        String?
  lastName         String?
  role             UserRole  @default(INVESTOR)
  dfnsUserId       String?   @unique
  userAuthToken    String?              // DFNS end-user token (from login)
  refreshTokenHash String?              // SHA-256 of the current refresh token
  wallet           Wallet?
  investmentProfile InvestmentProfile?  // 1:1 — questionnaire answers
  // ...
}

model InvestmentProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  answers   Json     // Record<string, string | string[]>
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}
```

Migrations:

- `20260708120000_add_auth_fields` — `email`, `firstName`, `lastName`, `refreshTokenHash`.
- `20260708130000_add_user_role` — `UserRole` enum + `role` column (default `INVESTOR`).
- `20260708140000_add_kyc_fields` — `kycStatus`, `sumsubApplicantId`, `sumsubExternalUserId`.
- `20260710174103_add_investment_profile` — `InvestmentProfile` model (1:1 with User).

The role default exists only for migration safety — **registration always sets the role explicitly**.

---

## Module Wiring

`AuthService` reuses `WalletsService` to provision wallets, and the wallet routes are protected by `JwtAuthGuard`. To avoid a circular dependency:

- **`WalletsModule` self-provides `JwtAuthGuard`** (it imports `JwtModule` and lists the guard as a provider) instead of importing `AuthModule`.
- **`AuthModule` imports `WalletsModule`** to reach `WalletsService` / `WalletsRepository`.

```
AuthModule  ──imports──▶  WalletsModule ──imports──▶ UsersModule
    │                          │
    └── JwtModule, UsersModule, DfnsModule
```

`DfnsModule` is `@Global`, so `DfnsService` is available everywhere.

---

## Endpoints

All under the `api/v1/auth` prefix. Every response is the standard `{ success, message, data, statusCode }` envelope.

| Method | Path                 | Auth   | Body                                                             | `data` returned                                                  |
| ------ | -------------------- | ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/register/init`     | —      | `{ email, role, firstName?, lastName? }`                         | DFNS registration challenge **or** `{ alreadyRegistered: true }` |
| POST   | `/register/complete` | —      | `{ email, temporaryAuthenticationToken, firstFactorCredential }` | `{ registered: true }`                                           |
| POST   | `/login/init`        | —      | `{ email }`                                                      | DFNS login challenge                                             |
| POST   | `/login/complete`    | —      | `{ email, challengeIdentifier, firstFactor }`                    | `{ accessToken, refreshToken, expiresIn, user }`                 |
| POST   | `/refresh`           | —      | `{ refreshToken }`                                               | `{ accessToken, refreshToken, expiresIn, user }`                 |
| GET    | `/me`                | Bearer | —                                                                | `user`                                                           |
| POST   | `/questionnaire`     | Bearer | `{ answers: Record<string, string \| string[]> }`                | `{ answers: Record<string, string \| string[]> }`                |
| POST   | `/logout`            | Bearer | —                                                                | `{ loggedOut: true }`                                            |

`user` (public shape):

```jsonc
{
  "id": "usr-…",
  "email": "alice@acme.io",
  "role": "INVESTOR",
  "firstName": "Alice",
  "lastName": "Doe",
  "walletId": "wa-…", // DFNS wallet id, null until provisioned
  "walletAddress": "G…", // Stellar address, null until provisioned
  "investmentProfile": {
    // questionnaire answers, null if not yet submitted
    "investor_type": "individual",
    "asset_familiarity": ["stocks", "crypto"],
    "risk_appetite": "moderate",
    "understanding_platform": "basic",
    "understanding_collateral": "basic",
  },
}
```

---

## JWT Design

Tokens are signed with `@nestjs/jwt`, each with its own secret so an access secret leak cannot mint refresh tokens.

**Access token** (`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, default `15m`):

```jsonc
{ "sub": "usr-…", "email": "…", "role": "INVESTOR", "walletId": "wa-…", "walletAddress": "G…", "iat": …, "exp": … }
```

**Refresh token** (`JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, default `7d`): same claims **plus** `"type": "refresh"`.

Rotation & revocation:

- On issue, the SHA-256 hash of the refresh token is stored in `user.refreshTokenHash`.
- `/refresh` verifies the signature **and** that the presented token's hash matches the stored one, then rotates (new pair, new stored hash). A stale refresh token is rejected.
- `/logout` clears `refreshTokenHash`, invalidating the refresh chain.

The wallet claims (`walletId`, `walletAddress`) are sourced from the DB at token-issue time, so they appear as soon as the wallet exists.

---

## Flows

### Registration

1. **`/register/init`** — looks up the user by email. If already a full DFNS user → `{ alreadyRegistered: true }` (FE switches to login). Otherwise it ensures a local `User` row (with role + names), tries to reuse an existing DFNS EndUser, and returns a **DFNS delegated registration challenge**.
2. Browser signs the challenge with a new passkey (`webauthn.create`).
3. **`/register/complete`** — completes DFNS registration with the attestation, stores `dfnsUserId`, then **provisions the wallet** (see below).
4. The FE then runs the login ceremony to mint tokens (registration itself does not return tokens).

### Login

`POST /auth/login` on DFNS is a **public** endpoint — the WebAuthn assertion _is_ the proof of identity, so there is **no temporary token**.

1. **`/login/init`** — returns a DFNS login challenge (`createLoginChallenge`).
2. Browser signs it (`webauthn.sign`).
3. **`/login/complete`** — calls `dfns.api.auth.login({ challengeIdentifier, firstFactor })`, stores the returned DFNS `userAuthToken`, looks up the user's wallet, and **issues the app's access + refresh tokens** (with wallet claims).

### Token Refresh

`/refresh` verifies the refresh token (signature + stored-hash match), then rotates and returns a fresh pair. The frontend calls this automatically from its NextAuth `jwt` callback when the access token nears expiry.

---

## Wallet Provisioning & USDC Trustline

`AuthService.provisionWallet(userId, email)` runs during registration (idempotent — skips if a wallet already exists), in this exact order:

```
createWallet (SA-owned, delayDelegation)
   → friendbot fund (inside createWallet)
   → addUsdcTrustline  (SA-signed, BEFORE delegation)
   → delegateWallet    (transfer control to the end user)
```

Why the trustline is added **before** delegation: while the wallet is still service-account-owned, the SA can sign for it server-side with **no passkey**. After delegation only the user's passkey can sign, and there is no passkey ceremony available during registration.

`WalletsService.addUsdcTrustline(walletId, address)`:

- Loads (and if needed friendbot-funds) the account for a sequence number.
- Skips if the USDC balance line already exists (idempotent).
- Builds a Stellar `changeTrust` op and submits it via DFNS **`broadcastTransaction`**, which signs with the wallet key (authorized by the SA credential) and broadcasts to Stellar Testnet.

USDC asset (defaults in [`src/utils/constant.ts`](../src/utils/constant.ts), overridable via env):

| Field             | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| `USDC_ISSUER`     | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| `USDC_ASSET_CODE` | `USDC`                                                     |

Provisioning is **non-fatal**: if DFNS/Horizon hiccups, registration still succeeds and the wallet claims stay `null` until it's retried.

> `broadcastTransaction` confirms asynchronously on-chain (a few seconds). Fine for the later USDC faucet; poll transaction status if you need a hard confirmation before proceeding.

---

## Investment Profile Questionnaire

Before KYC verification, the frontend collects a 5-question investment profile (investor type, asset familiarity, risk appetite, platform understanding, collateral understanding). Answers are single-select or multi-select and stored as a `Record<string, string | string[]>` JSON.

### Endpoint

`POST /api/v1/auth/questionnaire` (Bearer-protected) — accepts `{ answers }` and upserts the user's `InvestmentProfile` (1:1 relation, keyed by `userId`).

### Data Flow

```
FE questionnaire form
  → POST /auth/questionnaire { answers: Record<string, string | string[]> }
  → UsersRepository.upsertInvestmentProfile(userId, answers)
  → InvestmentProfile row (create or update)
  → FE refetches /auth/me → publicUser now includes investmentProfile
```

### `publicUser` shape

The `publicUser()` helper in `AuthService` maps the Prisma `User` (with relations) to the public API shape. It casts `investmentProfile.answers` from `Json` to `Record<string, string | string[]>` (or `null` if not yet submitted).

### `UserWithRelations` type

The `get()`, `getByEmail()`, and `getByUsername()` repository methods return `UserWithRelations` — a `Prisma.UserGetPayload<{ include: { wallet, signSession, investmentProfile } }>` — so that `publicUser()` can access `user.investmentProfile` with full type safety. This type is exported from `UsersRepository` and imported by `AuthService`.

---

## Route Protection

`JwtAuthGuard` ([`jwt-auth.guard.ts`](../src/auth/jwt-auth.guard.ts)) reads `Authorization: Bearer <accessToken>`, verifies it with `JWT_ACCESS_SECRET`, and attaches the decoded payload to `req.user` (`{ sub, email, role, walletId, walletAddress }`).

Protected:

- `GET /auth/me`, `POST /auth/logout`
- The entire `WalletsController` (`api/v1/wallets/*`) — `@UseGuards(JwtAuthGuard)` at the class level.

The frontend sends the NextAuth-stored access token as the bearer on all wallet calls.

---

## Environment

Added to [`.env.example`](../.env.example) (real values in `.env`, gitignored):

```env
# JWT (app-issued access + refresh tokens) — generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=""
JWT_REFRESH_SECRET=""
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"

# USDC asset trusted by every provisioned wallet
USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
USDC_ASSET_CODE="USDC"
```

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are in the required-env check in [`main.ts`](../src/main.ts) — the app exits on boot if they're missing.

---

## Notes & Gotchas

- **DFNS login is public** — `createLoginChallenge`'s response has no `temporaryAuthenticationToken`; `login` completes with just `challengeIdentifier` + `firstFactor`. Do not wrap it in a user-token client.
- **Role is sourced from the DB** for the JWT — the client-supplied role only matters at registration. This keeps role authoritative.
- **No `any`** in the auth code; DFNS responses are typed via `@dfns/sdk/generated/auth` types plus small local interfaces.
- **Duplicate DTO warning**: the legacy `users` module still declares `RegisterInitDTO` / `LoginInitDTO` / etc. with the same class names, so Swagger logs "Duplicate DTO detected". Those `users` auth endpoints are superseded by `/auth` and can be removed to silence it.
