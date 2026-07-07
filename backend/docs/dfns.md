# DFNS Backend Integration

How the NestJS backend integrates with [DFNS](https://www.dfns.io/) (delegated custody) to let end users create Stellar Testnet wallets with passkeys and sign messages — without ever touching a private key.

---

## 1. What is DFNS?

DFNS is a wallet infrastructure provider. Two key concepts:

| Concept                  | What it is                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service Account (SA)** | A backend identity that has org-wide admin rights. Signs API requests with an RSA key. The backend uses this to create wallets, list users, etc. |
| **EndUser**              | A real human, identified by username. Authenticated via WebAuthn/passkey. Holds their own delegated wallets and signs with their own passkey.    |
| **Delegated wallet**     | A wallet owned by the SA, but with signing rights **delegated** to an EndUser. The user holds the key share on their device (passkey).           |
| **WebAuthn challenge**   | A DFNS-issued challenge that the user must sign with their registered passkey. Required for any sensitive action.                                |

---

## 2. Requirements

### 2.1 DFNS account setup (one-time, in the DFNS Dashboard)

1. **Create an organisation** → note the `Organization ID` (e.g. `or-01jsu-...`).
2. **Create a Service Account**:
   - Dashboard → Settings → Service Accounts → Create
   - Permission set: **`ManagedFullAdminAccess`**
   - Authentication: **Asymmetric Key** (RSA)
   - Download the **PEM private key** → save as `backend/config/service-account.pem`
   - Note the `Service Account ID` (e.g. `sa-...`)
3. **Create a Permission Set for EndUsers** (or use the default `ManagedDefaultEndUserAccess` which is auto-attached and already includes `Keys:Signatures:Create`).
4. **Register your backend's origin** under Settings → CORS / Origins (for delegated user auth, this must match your BE/FE domain).
5. **Enable the Stellar network** for your org (Stellar Testnet is enabled by default).

### 2.2 Local env

`backend/.env`:

```env
# DFNS
DFNS_ORG_ID=or-01jsu-...
DFNS_SERVICE_ACCOUNT_ID=sa-...
DFNS_SERVICE_ACCOUNT_PEM_PATH=config/service-account.pem
DFNS_BASE_URL=https://api.dfns.io

# Stellar (testnet defaults — override only if needed)
HORIZON_URL=https://horizon-testnet.stellar.org
FRIENDBOT_URL=https://friendbot.stellar.org

# Backend
PORT=2000
```

The PEM file must be **2048-bit RSA**, PKCS#8 (PEM begins with `-----BEGIN PRIVATE KEY-----`, **not** `-----BEGIN RSA PRIVATE KEY-----`). DFNS rejects other formats.

> **Why PKCS#8?** The DFNS AsymmetricKeySigner uses `crypto.createPrivateKey()` which on Node 22+ requires PKCS#8. Legacy PKCS#1 (`RSA PRIVATE KEY`) is rejected with a confusing key-length error.

### 2.3 Packages

```bash
pnpm add @dfns/sdk @dfns/sdk-keysigner @nestjs/config @stellar/stellar-sdk
```

Pinned versions used here:

| Package                | Version  |
| ---------------------- | -------- |
| `@dfns/sdk`            | `0.8.23` |
| `@dfns/sdk-keysigner`  | `0.8.23` |
| `@stellar/stellar-sdk` | `16.0.1` |
| `@nestjs/config`       | `4.0.4`  |

---

## 3. Project structure (backend)

```
backend/
├── config/
│   └── service-account.pem        # SA private key (PKCS#8, gitignored)
├── scripts/
│   ├── list-end-users.ts          # debug: list EndUsers + perms
│   └── list-wallets.ts            # debug: list wallets
└── src/
      ├── dfns/
      │   └── dfns.service.ts      # DfnsApiClient init (SA scope)
      ├── users/
      │   ├── users.controller.ts  # /users/register/* and /users/login/*
      │   ├── users.service.ts     # in-memory user store
      │   └── ...
      ├── wallets/
      │   └── wallets.controller.ts # /wallets/* (create, delegate, sign)
      └── dfns/dfns.module.ts
```

---

## 4. DFNS client setup (`dfns.service.ts`)

```ts
import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import * as fs from 'fs';

const privateKey = fs.readFileSync(
  this.config.get('DFNS_SERVICE_ACCOUNT_PEM_PATH')!,
  'utf8',
);

const signer = new AsymmetricKeySigner({
  privateKey, // PKCS#8 PEM string
  credId: this.config.get('DFNS_SERVICE_ACCOUNT_ID')!,
  orgId: this.config.get('DFNS_ORG_ID')!,
});

this.api = new DfnsApiClient({
  appId: 'sep57-backend',
  baseUrl: this.config.get('DFNS_BASE_URL')!,
  signer,
});
```

> **`appId` is deprecated in newer DFNS SDK versions.** Pass `as any` if TS complains — it's silently ignored.

---

## 5. End-to-end flow

The full delegated user flow has **5 steps**, split across 2 systems:

| #   | Actor     | Action                                                  | Endpoint                          |
| --- | --------- | ------------------------------------------------------- | --------------------------------- |
| 1   | FE        | Enter username                                          | —                                 |
| 2   | BE        | Look up / create DFNS EndUser                           | `POST /users/register/init`       |
| 3   | FE        | Sign WebAuthn challenge with passkey (creates EndUser)  | `POST /users/register/complete`   |
| 4   | BE + DFNS | Create wallet with `delayDelegation: true`              | `POST /wallets`                   |
| 5   | BE + DFNS | Delegate wallet to EndUser                              | `POST /wallets/:id/delegate`      |
| 6   | BE        | Build unsigned Stellar tx (manageData carrying message) | `POST /wallets/:id/sign/init`     |
| 7   | FE        | Sign WebAuthn challenge with passkey                    | `POST /wallets/:id/sign/complete` |

### 5.1 EndUser creation

#### `POST /users/register/init`

The BE searches existing DFNS EndUsers (by listing with `kind: 'EndUser'`, filtering client-side — see §6.1) to avoid creating a new user on every BE restart.

If not found:

```ts
await this.dfns.api.users.createUser({
  body: {
    username,
    kind: 'EndUser',
  } as any,
});
```

The DFNS response includes a `challenge` (WebAuthn challenge). BE forwards it to FE.

#### `POST /users/register/complete`

FE signs the WebAuthn challenge with the browser passkey using `@dfns/sdk-browser` `WebAuthnSigner`. BE forwards the result to DFNS:

```ts
await this.dfns.api.users.createUserComplete({
  body: { challengeIdentifier, firstFactor: signedChallenge },
});
```

The response contains a `token` (user-scoped JWT). BE stores it on the user record. **All future signing uses this token via `DfnsDelegatedApiClient`**, not the SA client.

### 5.2 Wallet creation

```ts
await this.dfns.api.wallets.createWallet({
  body: {
    network: 'StellarTestnet',
    name: `${username}-stellar`,
    delayDelegation: true, // critical: see §6.3
  } as any,
});
```

Immediately fund the new account on testnet:

```ts
await fetch(`https://friendbot.stellar.org?addr=${wallet.address}`);
```

(Friendbot only works on testnet. On mainnet, the user would fund manually.)

### 5.3 Delegation

```ts
await this.dfns.api.wallets.delegateWallet({
  walletId,
  body: { userId: endUser.dfnsUserId },
});
```

Until this is called, the wallet is owned by the SA only — the EndUser cannot sign for it (results in `403 Keys:Signatures:Create`).

### 5.4 Signing a message

Stellar on DFNS only supports `kind: 'Transaction'`. There is no generic Message-signing kind. Workaround: build a no-op transaction whose `manageData` op carries the message bytes.

```ts
const account = await horizon.loadAccount(walletAddress);
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.manageData({
      name: 'msg',
      value: Buffer.from(message, 'utf8'),
    }),
  )
  .setTimeout(180)
  .build();

const transactionXdr = '0x' + tx.toEnvelope().toXDR('hex');
```

#### `POST /wallets/:id/sign/init`

```ts
const delegated = new DfnsDelegatedApiClient({
  appId: 'sep57-backend',
  baseUrl,
  signer, // same SA signer
});

const challenge = await delegated.keys.generateSignatureInit({
  keyId: wallet.signingKey.id,
  body: {
    kind: 'Transaction',
    transaction: transactionXdr,
    network: 'StellarTestnet',
  } as any,
});
```

BE stores `transactionXdr` on the user record (the Stellar sequence number would change if we rebuilt it on complete).

#### `POST /wallets/:id/sign/complete`

```ts
const result = await delegated.keys.generateSignatureComplete(
  {
    keyId,
    body: {
      kind: 'Transaction',
      transaction: storedXdr,
      network: 'StellarTestnet',
    },
  },
  { challengeIdentifier, firstFactor: signedChallenge } as any,
);
```

Result is returned to the FE. It includes the signed transaction envelope XDR — the signature is verifiable against the Stellar pubkey.

---

## 6. Gotchas (every one cost us time)

### 6.1 `ListUsersQuery` type too strict

The SDK's `listUsers` query has a strict type that doesn't accept the `query` field for filtering by username. Workaround:

```ts
const list = await this.dfns.api.users.listUsers({
  query: { kind: 'EndUser', limit: 100 },
} as any);
const match = list.items.find((u: any) => u.username === username);
```

### 6.2 `403 Keys:Signatures:Create` despite correct role

Root cause: the wallet was **not delegated** to the EndUser. The `ManagedDefaultEndUserAccess` role has the permission, but delegation is a separate, explicit step. The error message is misleading.

Fix: call `delegateWallet({ userId })` after `createWallet`.

### 6.3 `key not delegatable`

`createWallet` defaults to creating the key in a state where it cannot be delegated. Fix:

```ts
createWallet({ body: { ..., delayDelegation: true } })
```

The key is created in a delegatable state; you must call `delegateWallet` to actually attach it to a user.

### 6.4 `invalid construct kind` when signing

Stellar signing on DFNS only supports `kind: 'Transaction'`. You cannot pass a raw message. Solution: wrap the message in a no-op Stellar transaction with a `manageData` op (see §5.4).

### 6.5 Horizon `loadAccount` returns 404

Newly created Stellar accounts don't exist on Horizon until funded. Solution: call `friendbot` (testnet) immediately after `createWallet`, and on `loadAccount` 404, retry once after funding.

### 6.6 Sequence number drift

If you rebuild the transaction in `signComplete` using a fresh `loadAccount`, the sequence number may have advanced (especially under load). DFNS signs whatever you send, but the resulting signed envelope won't match what you intended. Solution: store the exact `transactionXdr` from `signInit` and reuse it on `signComplete`.

### 6.7 PEM key format

`AsymmetricKeySigner` requires PKCS#8 PEM. If your PEM begins with `-----BEGIN RSA PRIVATE KEY-----`, convert it:

```bash
openssl pkcs8 -topk8 -nocrypt -in old.pem -out service-account.pem
```

### 6.8 `appId` is deprecated

The SDK still accepts it (with a TS warning) but newer versions removed it. Pass `as any` and ignore the warning.

---

## 7. Debug scripts

`backend/scripts/list-end-users.ts`:

```bash
node -e "require('tsx/cjs/api').register(); require('./scripts/list-end-users.ts');" -- <optional-userId>
```

Lists all EndUsers in the org with their permission set. Useful for verifying a user exists and has the right role.

`backend/scripts/list-wallets.ts`:

```bash
node -e "require('tsx/cjs/api').register(); require('./scripts/list-wallets.ts');"
```

Lists all wallets in the org with their network and signing-key status.

---

## 8. Running locally

```bash
cd backend
pnpm install
pnpm start:dev          # NestJS on :2000
```

Endpoints exposed:

| Method | Path                         | Purpose                                             |
| ------ | ---------------------------- | --------------------------------------------------- |
| `GET`  | `/dfns/whoami`               | Verify SA creds work                                |
| `POST` | `/users/register/init`       | Step 1 of EndUser creation                          |
| `POST` | `/users/register/complete`   | Step 2 of EndUser creation                          |
| `POST` | `/users/login/init`          | Step 1 of returning-user login                      |
| `POST` | `/users/login/complete`      | Step 2 of returning-user login                      |
| `POST` | `/wallets`                   | Create Stellar Testnet wallet (funds via friendbot) |
| `POST` | `/wallets/:id/delegate`      | Delegate wallet to EndUser                          |
| `POST` | `/wallets/:id/sign/init`     | Step 1 of message signing                           |
| `POST` | `/wallets/:id/sign/complete` | Step 2 of message signing                           |
