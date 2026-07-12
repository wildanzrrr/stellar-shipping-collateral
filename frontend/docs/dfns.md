# DFNS Frontend Integration

How the Next.js frontend talks to the NestJS backend (which talks to DFNS) to let a user create a delegated Stellar Testnet wallet using their passkey and sign messages — all without ever seeing a private key.

---

## 1. What the frontend actually does

The FE is **thin**. It:

1. Collects a username.
2. Drives the WebAuthn/passkey ceremony on the user's device (this is the only part that touches the user directly).
3. Forwards the passkey signature to the BE, which forwards to DFNS.
4. Displays whatever the BE returns.

The FE **never** holds private keys, never signs API requests with the SA, and never sees the userAuthToken's signing material. It only sees:

- A DFNS-issued `challenge` (public)
- A WebAuthn assertion produced by the browser's authenticator (passkey)
- A `token` (user-scoped JWT) returned to it from the BE — opaque to the FE

---

## 2. Requirements

### 2.1 Browser support

| Feature              | Required | Notes                                                                                                                                                                                               |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebAuthn / Passkeys  | ✅       | Chrome 109+, Safari 16+, Firefox 122+.                                                                                                                                                              |
| HTTPS or `localhost` | ✅       | WebAuthn requires secure context. `http://localhost:3000` is exempt; for LAN testing, you need HTTPS or `chrome://flags#unsafely-treat-insecure-origin-as-secure`.                                  |
| Browser passkey      | ✅       | User must have at least one passkey configured (Touch ID, Windows Hello, hardware key, etc.) on the same origin (or a passkey synced via iCloud/Google Password Manager for the RP id `localhost`). |

### 2.2 Packages

```bash
pnpm add @dfns/sdk-browser @dfns/sdk
```

The browser SDK is what performs the passkey assertion. It wraps the browser's `navigator.credentials.get()` and formats the assertion the way DFNS expects.

### 2.3 Backend dependency

The FE assumes the backend is running on `http://localhost:2000` (or `process.env.NEXT_PUBLIC_BE_URL`).

Set in `frontend/.env.local`:

```env
NEXT_PUBLIC_BE_URL=http://localhost:2000
```

---

## 3. Project structure (frontend)

The FE is organized under `app/app/` (authenticated product) and `app/app/auth/` (login/register):

```
frontend/
└── app/
    └── app/
        ├── auth/_components/         # passkey register/login flow (use-auth-flow.ts)
        ├── _components/               # shared app building blocks
        │   ├── role-panel.tsx         # role-aware dashboard panel
        │   ├── rwa-list.tsx           # role-gated RWA/collateral listings
        │   ├── wallet-modal.tsx       # wallet pill → modal (balances, QR, transfer)
        │   └── app-navbar.tsx        # top nav with WalletModal
        └── (protected)/
            ├── page.tsx             # dashboard — full-width RWA list, no DFNS demo widgets
            ├── collateral/          # collateral list + new + [rwaId] detail
            └── history/             # on-chain event log
```

The early DFNS "sign a message" demo (`sign-message-form.tsx`, `use-sign-message.ts`, `wallet-info.tsx`) was removed from the dashboard — signing now happens only through real flows (issue collateral, collect funds, settle debt, transfer) via the `use-tx-action.ts` / `use-transfer.ts` hooks.

---

## 4. The two DFNS browser primitives

```ts
import { DfnsBrowserClient, WebAuthnSigner } from '@dfns/sdk-browser';
import { DfnsDelegatedApiClient } from '@dfns/sdk';
```

| Class                    | Purpose                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebAuthnSigner`         | A pluggable signer for browser-originating WebAuthn assertions. The FE instantiates one and passes it to the delegated client.                      |
| `DfnsDelegatedApiClient` | The DFNS SDK client that uses a `WebAuthnSigner` instead of an asymmetric RSA key. It produces a user-scoped JWT and signs requests with it.        |
| `DfnsBrowserClient`      | Optional. Higher-level helper that wraps `DfnsDelegatedApiClient` with a built-in token-store. We do **not** use it here — the BE owns token state. |

We use `DfnsDelegatedApiClient` with a `WebAuthnSigner` only at the moment of completing a DFNS challenge. The token is then returned to the BE for storage. The FE does not call DFNS directly.

---

## 5. End-to-end flow (FE perspective)

| #   | FE step                                                         | What happens under the hood                                                                                                     |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | User types a username and clicks **Continue**                   | FE calls `api.registerInit(username)` → BE returns a DFNS challenge.                                                            |
| 2   | Browser shows a passkey prompt                                  | FE uses `WebAuthnSigner` to sign the DFNS challenge with the user's passkey.                                                    |
| 3   | FE calls `api.registerComplete(...)`                            | BE forwards to DFNS, gets a `userAuthToken`, stores it.                                                                         |
| 4   | FE shows **Create wallet** button                               | On click: `api.createWallet(username)` → BE creates a Stellar Testnet wallet via DFNS, funds via friendbot.                     |
| 5   | FE automatically calls `api.delegateWallet(username, walletId)` | BE delegates the wallet to the EndUser. Status: "Delegating wallet to you…".                                                    |
| 6   | FE shows **Sign message** button + textarea                     | On click: `api.signInit(username, walletId, message)` → BE builds an unsigned Stellar tx and asks DFNS for a signing challenge. |
| 7   | Browser shows passkey prompt again                              | FE uses `WebAuthnSigner` to sign the challenge.                                                                                 |
| 8   | FE calls `api.signComplete(...)`                                | BE forwards to DFNS, gets the signed transaction XDR.                                                                           |

The "status" line in the UI walks through these states so the user always knows what's happening — passkey prompts can be confusing otherwise.

---

## 6. The passkey signing step

The same pattern is used at both register-complete and sign-complete:

```ts
const webauthnSigner = new WebAuthnSigner({
  rpId: window.location.hostname,   // 'localhost' in dev
});

const delegated = new DfnsDelegatedApiClient({
  appId: 'sep57-frontend',
  baseUrl: 'https://api.dfns.io',
  signer: webauthnSigner,
});

// For register-complete:
const result = await delegated.auth.createUserRegistration({
  body: { challengeIdentifier, username },
});

// For sign-complete:
const result = await delegated.keys.generateSignatureComplete(
  { keyId, body: { kind: 'Transaction', transaction, network: 'StellarTestnet' } },
  { challengeIdentifier, firstFactor: { kind: 'Fido2', credentialAssertion: ... } },
);
```

> **Why `rpId: window.location.hostname`?** The WebAuthn RP ID must match the passkey's registered origin. For `localhost` dev, that's the literal string `localhost`. For production, it's your domain (e.g. `app.example.com`).

> **Why go through DFNS directly from the FE?** The passkey assertion is bound to the user's device. The browser must sign it. The BE cannot. We could proxy it (BE → FE → BE → DFNS) but it's simpler to let the FE call DFNS for just this step. The response is returned to the BE, not stored in the FE.

---

## 7. The `api.ts` wrapper

`frontend/lib/api.ts` is a typed wrapper around `fetch`:

```ts
const BE = process.env.NEXT_PUBLIC_BE_URL ?? 'http://localhost:2000';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  registerInit: (username: string) =>
    req<{ challenge: string; challengeIdentifier: string; existing: boolean }>(
      'POST', '/users/register/init', { username },
    ),
  registerComplete: (username: string, payload: any) =>
    req<{ token: string }>('POST', '/users/register/complete', { username, ...payload }),
  createWallet: (username: string) =>
    req<{ id: string; address: string }>('POST', '/wallets', { username }),
  delegateWallet: (username: string, walletId: string) =>
    req<unknown>('POST', `/wallets/${walletId}/delegate`, { username }),
  signInit: (username: string, walletId: string, message: string) =>
    req<{ challenge: string; challengeIdentifier: string; transactionXdr: string }>(
      'POST', `/wallets/${walletId}/sign/init`, { username, message },
    ),
  signComplete: (username: string, walletId: string, payload: any) =>
    req<{ signedTransaction?: any; signature?: string }>(
      'POST', `/wallets/${walletId}/sign/complete`, { username, ...payload },
    ),
};
```

The FE never imports the DFNS SDK at module-level except for the `WebAuthnSigner` class — everything else is plain HTTP to the BE.

---

## 8. UI status state machine

```
idle
  └─ (username entered, click Continue)
     → registering
        ├─ (success) → registered
        └─ (error)  → error
registered
  └─ (click Create wallet)
     → creating-wallet
        ├─ (success) → delegating → wallet-ready
        └─ (error)  → error
wallet-ready
  └─ (type message, click Sign)
     → signing
        ├─ (success) → signed
        └─ (error)  → error
```

The status string is rendered next to the username so the user always knows which passkey prompt corresponds to which step. (The browser passkey modal doesn't tell you anything.)

---

## 9. Gotchas

### 9.1 WebAuthn over HTTP

WebAuthn requires a secure context. `http://localhost:3000` works, but `http://192.168.x.x:3000` does not. For LAN testing, use HTTPS or whitelist the origin in Chrome.

### 9.2 RP ID mismatch

If a user previously registered a passkey for RP ID `localhost` and you change the dev port or the dev domain, the passkey will not be offered. Either:

- Register a new passkey on the new origin, or
- Match the original RP ID exactly

### 9.3 Multiple passkeys

If the user has more than one passkey, the browser will show a chooser. This is normal. The FE cannot enumerate them.

### 9.4 Don't store the userAuthToken in the FE

It is a long-lived bearer for the EndUser. Store it only on the BE (in the in-memory `UsersService` in this app, or in a real DB). The FE should never see it.

### 9.5 Passkey UX

Passkey prompts are fast and easy to miss. Always show a status message in the FE before each passkey prompt, and never trigger more than one at a time. Otherwise the user will see a prompt they don't recognize and cancel it.

---

## 10. Running locally

```bash
cd frontend
pnpm install
pnpm dev          # Next.js on :3000
```

Open `http://localhost:3000`. The backend must be running on `:2000` for any flow to work.
