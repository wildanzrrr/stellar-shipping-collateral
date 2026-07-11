# SEP57 Frontend — Authentication

Authentication for the Next.js app: **NextAuth (Auth.js v5) wrapping backend-issued JWTs**, protecting the `/app` surface. The DFNS passkey ceremony runs in the browser; the backend returns access + refresh tokens; NextAuth stores them in its session and auto-refreshes them. API calls go through **TanStack Query**.

## Table of Contents

- [Overview](#overview)
- [File Map](#file-map)
- [Routes & Protection](#routes--protection)
- [NextAuth Configuration](#nextauth-configuration)
- [The Auth Flow (client)](#the-auth-flow-client)
- [Auth Page Building Blocks](#auth-page-building-blocks)
- [API Client](#api-client)
- [TanStack Query](#tanstack-query)
- [Session & Wallet in the Dashboard](#session--wallet-in-the-dashboard)
- [Toasts](#toasts)
- [Environment](#environment)
- [Notes & Gotchas](#notes--gotchas)

---

## Overview

The DFNS passkey ceremony must run in the browser (WebAuthn), so it cannot happen inside NextAuth's server-side `authorize()`. The flow is therefore:

```
browser: passkey ceremony ──▶ BE returns { accessToken, refreshToken, user }
        └─▶ signIn("dfns", {...tokens}) ──▶ NextAuth session (JWT strategy) stores them
                                          └─▶ proxy middleware gates /app
```

| Concern         | Choice                                                  |
| --------------- | ------------------------------------------------------- |
| Session library | `next-auth@5` (Auth.js v5, Credentials provider)        |
| Session storage | Encrypted JWT cookie (holds BE access + refresh tokens) |
| Token refresh   | Automatic in the `jwt` callback → BE `/auth/refresh`    |
| Route guard     | `proxy.ts` (Next 16's `middleware` replacement)         |
| Data fetching   | `@tanstack/react-query`                                 |
| Toasts          | `sonner`, top-right                                     |

---

## File Map

```
frontend/
├── auth.ts                               # NextAuth config (handlers, auth, signIn, signOut)
├── proxy.ts                              # route guard for /app/* (was middleware.ts)
├── types/next-auth.d.ts                  # Session / User / JWT augmentation
├── app/
│   ├── layout.tsx                        # mounts <Toaster /> (top-right)
│   ├── api/auth/[...nextauth]/route.ts   # NextAuth route handler (GET/POST)
│   └── app/
│       ├── layout.tsx                    # SessionProvider + QueryProvider (protected shell)
│       ├── page.tsx                      # role-aware dashboard (wallet + sign)
│       └── auth/
│           ├── page.tsx                  # thin: <Suspense><AuthPanel/></Suspense>
│           └── _components/              # building blocks (below)
├── components/
│   ├── session-provider.tsx              # "use client" SessionProvider wrapper
│   ├── query-provider.tsx                # "use client" QueryClientProvider
│   └── ui/sonner.tsx                     # Toaster (position="top-right")
└── lib/
│   ├── api.ts                            # typed BE client (authApi + walletApi + sumsubApi)
    └── dfns.ts                           # WebAuthnSigner (passkey)
```

---

## Routes & Protection

- `/` — public landing page.
- `/app` — authenticated dashboard.
- `/app/auth` — sign in / create account.

[`proxy.ts`](../proxy.ts) (matcher `["/app/:path*"]`) wraps `auth`:

- Unauthenticated request to `/app/*` (except `/app/auth`) → redirect to `/app/auth?callbackUrl=<path>`.
- Authenticated request to `/app/auth` → redirect to `/app`.

> Next 16 deprecated `middleware.ts` in favor of **`proxy.ts`** (same API, default export). It shows as `ƒ Proxy (Middleware)` in the build output.

The `/app` layout also wraps children in `SessionProvider` + `QueryProvider`, and `/app/page.tsx` redirects to `/app/auth` if `status === "unauthenticated"` (defense-in-depth).

---

## NextAuth Configuration

[`auth.ts`](../auth.ts) — Credentials provider `id: "dfns"`, `session.strategy: "jwt"`, `pages.signIn: "/app/auth"`.

**`authorize`** — the passkey ceremony has already produced tokens by the time we get here; it just validates and forwards them into the session (email + accessToken required):

```ts
signIn("dfns", {
  email, userId, role, firstName, lastName,
  walletId, walletAddress,
  accessToken, refreshToken, expiresIn,   // from BE /auth/login/complete
  redirect: false,
})
```

**`jwt` callback** — seeds the token on first sign-in; on later calls reuses it while valid (30s safety margin) or calls `refreshAccessToken()` → BE `/auth/refresh` to rotate. On failure it sets `token.error = "RefreshTokenError"`.

**`session` callback** — exposes `session.accessToken`, `session.error`, and `session.user` = `{ id, role, firstName, lastName, walletId, walletAddress, name, email }`.

Types are augmented in [`types/next-auth.d.ts`](../types/next-auth.d.ts) for `Session`, `User`, and `JWT`.

The route handler is a one-liner:

```ts
// app/api/auth/[...nextauth]/route.ts
export const { GET, POST } = handlers
```

---

## The Auth Flow (client)

All ceremony + mutation logic lives in the [`useAuthFlow`](../app/app/auth/_components/use-auth-flow.ts) hook.

**Login** (`completeLogin`):

1. `authApi.loginInit(email)` → challenge.
2. `webauthn.sign(challenge)` → passkey assertion.
3. `authApi.loginComplete({ email, challengeIdentifier, firstFactor })` → tokens + user.
4. `signIn("dfns", {...})` → NextAuth session, then `router.push(callbackUrl)`.

**Register** (`registerFlow`):

1. `authApi.registerInit({ email, role, firstName?, lastName? })`.
2. If `{ alreadyRegistered }` → fall through to the login ceremony.
3. `webauthn.create(challenge)` → passkey attestation.
4. `authApi.registerComplete({ email, temporaryAuthenticationToken, firstFactorCredential })` — the BE provisions the wallet here.
5. `completeLogin(email)` → tokens + session.

Both are wrapped in `useMutation`; `busy = loginMutation.isPending || registerMutation.isPending`, and a human-readable `status` string walks each passkey step. Errors surface as toasts.

---

## Auth Page Building Blocks

`app/app/auth/page.tsx` is intentionally thin — it only provides the `Suspense` boundary that `useSearchParams` needs and renders the orchestrator. Everything else is composed from `_components/`:

| File                                                               | Responsibility                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`auth-panel.tsx`](../app/app/auth/_components/auth-panel.tsx)     | Orchestrator: mode state, header, tabs, form, status                  |
| [`mode-tabs.tsx`](../app/app/auth/_components/mode-tabs.tsx)       | Sign in / Create account toggle                                       |
| [`auth-form.tsx`](../app/app/auth/_components/auth-form.tsx)       | Email + (role + names in register mode) + submit; owns field state    |
| [`role-select.tsx`](../app/app/auth/_components/role-select.tsx)   | Investor / Shipping Company picker                                    |
| [`use-auth-flow.ts`](../app/app/auth/_components/use-auth-flow.ts) | Passkey ceremonies + TanStack mutations + `status` (behavior, not UI) |
| [`types.ts`](../app/app/auth/_components/types.ts)                 | `Mode` + `AuthFormValues`                                             |

Rationale: visual blocks (`AuthForm`, `ModeTabs`, `RoleSelect`) stay pure and reusable; the DFNS/session logic is isolated in a hook. `page.tsx` is a server component (no `"use client"`).

---

## API Client

[`lib/api.ts`](../lib/api.ts) targets `${NEXT_PUBLIC_BACKEND_URL}/api/v1` and unwraps the BE's `{ data }` envelope. It surfaces validation-error arrays as a joined message. Fully typed (no `any`).

- **`authApi`**: `registerInit`, `registerComplete`, `loginInit`, `loginComplete`, `me(accessToken)`, `submitQuestionnaire(accessToken, answers)`, `submitBusinessQuestionnaire(accessToken, answers)`, `refresh(refreshToken)`.
- **`walletApi`** (all send `Authorization: Bearer <accessToken>`): `createWallet`, `delegateWallet`, `signInit`, `signComplete`.
- **`sumsubApi`**: `getAccessToken(accessToken)` — fetches Sumsub WebSDK access token.

Exports shared types (`UserRole`, `ROLE_LABELS`, `PublicUser`, `AuthResult`, `RegisterInitResult`, `LoginChallenge`, `WalletInfo`, `SignChallenge`, `SignResult`, `QuestionnaireAnswers`, `KycStatus`, `KYC_STATUS_LABELS`, `KybStatus`, `KYB_STATUS_LABELS`).

### `QuestionnaireAnswers`

```ts
export type QuestionnaireAnswers = Record<string, string | string[]>
```

Added to `PublicUser` as `investmentProfile?: QuestionnaireAnswers | null` (investors) and `businessProfile?: QuestionnaireAnswers | null` (shipping companies). The `submitQuestionnaire` method POSTs answers to `POST /auth/questionnaire`; `submitBusinessQuestionnaire` POSTs to `POST /auth/business-questionnaire`. Both return `{ answers }` on success.

---

## TanStack Query

[`components/query-provider.tsx`](../components/query-provider.tsx) creates one stable `QueryClient` (30s `staleTime`, `retry: 1`, no refetch-on-focus) and is mounted in the `/app` layout alongside `SessionProvider`.

Usage:

- Auth flows → `useMutation` (in `useAuthFlow`).
- Dashboard current user/wallet → `useQuery(["me"], () => authApi.me(accessToken))`.
- Message signing → `useMutation`.

---

## Session & Wallet in the Dashboard

[`app/app/page.tsx`](../app/app/page.tsx) reads `useSession()` and a `useQuery(["me"])` (authoritative DB truth). The wallet is auto-provisioned at registration, so it arrives via the JWT/session **and** `me`:

```ts
const walletId = meQuery.data?.walletId ?? session?.user?.walletId ?? null
const role     = meQuery.data?.role     ?? session?.user?.role
```

The page branches its intro by `role` (Investor vs Shipping Company), shows the wallet id/address, and lets the user sign a message (passkey) via a mutation. If the wallet isn't ready yet it shows a "still being provisioned" note.

---

## Toasts

[`components/ui/sonner.tsx`](../components/ui/sonner.tsx) renders `<Toaster position="top-right" richColors />`, mounted once in the root [`app/layout.tsx`](../app/layout.tsx). All success/error feedback uses `toast.success` / `toast.error`; the auth form has **no inline error text** under the button.

---

## Environment

Added to [`.env.example`](../.env.example) (real values in `.env`, gitignored):

```env
# NextAuth (Auth.js v5) — generate AUTH_SECRET with: openssl rand -base64 33
AUTH_SECRET=
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# Backend base URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:2000
```

(Plus the existing `NEXT_PUBLIC_DFNS_*` vars used by the browser passkey signer — see [`dfns.md`](./dfns.md).)

---

## Investment Profile Questionnaire

Before KYC verification, **investors** complete a 5-question investment profile questionnaire. The answers are stored on the backend and displayed on the profile page.

### KYC Page (`/app/profile/kyc`)

Two-phase flow: **questionnaire → transition → Sumsub verification**.

```
questionnaire phase
  → user answers 5 questions (single + multi-select)
  → onComplete: POST /auth/questionnaire { answers }
  → refetch ["me"] query
  → 1.5s transition (success animation)
verification phase
  → fetch Sumsub access token
  → render <SumsubWebSdk/>
```

Shipping companies are redirected to the KYB page (they skip KYC entirely).

### Questionnaire Components

Route-private components in `app/app/(protected)/profile/kyc/_components/`:

| File                           | Responsibility                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `questionnaire-data.ts`        | Question definitions, types (`QuestionKind`, `QuestionOption`, `Question`), `QUESTIONS` array (5 questions)                |
| `investment-questionnaire.tsx` | Multi-step form (progress bar, single/multi-select, Back/Cancel, validation toast) + `QuestionnaireComplete` success state |

The component accepts `questions` and `ctaLabel` as optional props (defaults to investor questions + "Continue to KYC"), so the KYB page can reuse it with business questions.

The 5 investor questions:

| ID                         | Title                                      | Kind          |
| -------------------------- | ------------------------------------------ | ------------- |
| `investor_type`            | What best describes you?                   | single-select |
| `asset_familiarity`        | Which asset types are you familiar with?   | multi-select  |
| `risk_appetite`            | How would you describe your risk appetite? | single-select |
| `understanding_platform`   | How well do you understand the platform?   | single-select |
| `understanding_collateral` | How well do you understand collateral?     | single-select |

---

## Business Profile Questionnaire

Before KYB verification, **shipping companies** complete a 5-question business profile questionnaire. This mirrors the investment profile questionnaire but covers business operations instead of investor profiling. The `InvestmentQuestionnaire` component is reused with different questions and a "Continue to KYB" CTA.

### KYB Page (`/app/profile/kyb`)

Two-phase flow (mirrors KYC): **questionnaire → transition → Sumsub verification**.

```
questionnaire phase
  → user answers 5 business questions (single + multi-select)
  → onComplete: POST /auth/business-questionnaire { answers }
  → refetch ["me"] query
  → 1.5s transition (success animation)
verification phase
  → fetch Sumsub KYB access token
  → render <SumsubWebSdk/>
```

### Business Questionnaire Data

Route-private components in `app/app/(protected)/profile/kyb/_components/`:

| File                    | Responsibility                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `questionnaire-data.ts` | `BUSINESS_QUESTIONS` array (5 business questions), reuses `Question` type from KYC |

The 5 business questions:

| ID               | Title                                           | Kind          |
| ---------------- | ----------------------------------------------- | ------------- |
| `business_type`  | What type of shipping business do you operate?  | single-select |
| `fleet_size`     | How many vessels or vehicles are in your fleet? | single-select |
| `trade_routes`   | Which trade routes do you primarily operate?    | multi-select  |
| `annual_revenue` | What is your approximate annual revenue?        | single-select |
| `use_of_funds`   | How do you plan to use Bunkr financing?         | single-select |

---

## Profile Page (`/app/profile`)

Displays role-conditional cards:

- **Account card** — email, name, role badge, wallet address, KYC/KYB status badge (with "Verify now" link if not completed).
- **Investment Profile card** (investors only) — maps raw answer values to human-readable labels using `QUESTIONS` from `questionnaire-data.ts`, displayed as chips/badges. Shows "Retake questionnaire" link if profile exists, or "Start questionnaire" if not.
- **Business Profile card** (shipping companies only) — same pattern, maps `BUSINESS_QUESTIONS` answers to labels. "Retake questionnaire" links to `/app/profile/kyb`.
- **Business info card** (shipping companies with `companyName`) — company name, registration number, country (populated from the KYB webhook).

The profile page fetches `["me"]` (which includes `investmentProfile` and `businessProfile` from the backend) and uses an `answerLabels()` helper that accepts a questions array to map raw values to display labels for either questionnaire type.

---

## Notes & Gotchas

- **`useSearchParams` needs Suspense** — that's why `page.tsx` wraps `AuthPanel`; a component can't be both the `useSearchParams` consumer and its own `Suspense` boundary.
- **Access token lives in the session cookie** — the `jwt` callback rotates it via the BE before expiry; `session.error === "RefreshTokenError"` signals a failed refresh (treat as signed-out).
- **Wallet claims may be `null`** right after registration if provisioning hiccuped on the BE — the dashboard falls back to the `me` query and shows a provisioning note.
- **No `any`** in touched code — DFNS challenge objects are cast with `Parameters<typeof webauthn.sign>[0]` rather than `any`.
