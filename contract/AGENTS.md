# SEP57 Contracts — Agent Guide

> A Soroban workspace implementing a permissioned, identity-gated, compliance-bound
> token (SEP-57 style) with three core contracts and a stub factory.

---

## 1. Workspace at a Glance

```
contract/
├── Cargo.toml                  # workspace: resolver=2, members=contracts/*, soroban-sdk=25
├── contracts/
│   ├── compliance/             # rules engine: token binding + per-token max balance
│   ├── identity-verifier/      # KYC/KYB registry, gated by admin
│   ├── sep57/                  # the token itself (mint/transfer/burn, admin-permit gated)
│   └── factory/                # scaffold only (hello-world placeholder)
```

All contracts share the same module layout:

```
src/
├── lib.rs       # #[contract] + #[contractimpl] — public entrypoints
├── interface.rs # #[contracttrait] — public trait (used by clients/codegen)
├── storage.rs   # typed get/set/getters/guards on instance storage
├── types.rs     # #[contracttype] enums + structs (DataKey, snapshots, roles)
├── events.rs    # #[contractevent] payloads (topic fields marked with #[topic])
├── errors.rs    # #[contracterror] enum (u32-repr, frozen per contract)
└── test.rs      # soroban-sdk testutils-based unit tests
```

Release profile is set to `opt-level = "z"`, `overflow-checks = true`, `panic = "abort"`, `lto = true` — typical for size-bound wasm deploys.

---

## 2. Contract: `compliance`

**Purpose:** central rules engine any compliant token must respect. Other tokens register with it to be subject to per-token `max_balance` caps on creates/transfers.

### State (`storage.rs`, `types.rs::DataKey`)

| Key                   | Type      | Meaning                             |
| --------------------- | --------- | ----------------------------------- |
| `Initialized`         | `bool`    | one-time init guard                 |
| `Operator`            | `Address` | admin/operator for binding & caps   |
| `BoundToken(Address)` | `bool`    | is this token registered?           |
| `MaxBalance(Address)` | `i128`    | per-address balance cap (0 = unset) |

### Entrypoints (`interface.rs`)

Admin / operator surface:

- `initialize(env, operator)` — one-shot, sets `Operator`.
- `bind_token(env, token, operator)` — `operator.require_auth()` + `require_operator`; emits `TokenBound`.
- `unbind_token(env, token, operator)` — same auth; emits `TokenUnbound`.
- `set_max_balance(env, token, max_balance, operator)` — requires bound token, `max_balance > 0`; emits `MaxBalanceSet { token, max_balance }`.

Read surface:

- `is_token_bound(token) -> bool`
- `max_balance(token) -> i128` (defaults to 0)

Token-callback hooks (called **by** token contracts, not by users — `#[contractclient]` in the sep57 contract is what wires this up):

- `created(env, to, amount, token)` — rejects if `!is_token_bound(token)`, `amount <= 0`, or `to.balance + amount > max_balance(token)` → `MaxBalanceExceeded`.
- `transferred(env, from, to, amount, kind, token)` — same checks against the **receiver's** post-balance.
- `destroyed(env, from, amount, token)` — only checks bound + positive amount (no cap on burn).

> The `from` snapshot is taken but unused in `transferred` / `destroyed` — only the receiver is gated. `frozen` field is reserved; not enforced.

### Errors (`errors.rs`)

`Unauthorized`, `TokenNotBound`, `InvalidAmount`, `InvalidMaxBalance`, `MaxBalanceExceeded`, `AlreadyInitialized`.

### Events

`Initialized`, `TokenBound`, `TokenUnbound`, `MaxBalanceSet` — token is the `#[topic]` where applicable so off-chain indexers can subscribe per-token.

---

## 3. Contract: `identity-verifier`

**Purpose:** on-chain KYC/KYB registry. A user is either absent, present-but-unverified, or present-and-verified. The token calls `verify_identity(user)` before any state change involving that user.

### State

| Key           | Type                     | Meaning                                               |
| ------------- | ------------------------ | ----------------------------------------------------- |
| `Initialized` | `bool`                   | one-time init guard                                   |
| `Admin`       | `Address`                | sole identity writer                                  |
| `Users`       | `Map<Address, Identity>` | per-user record (whole map is rewritten on every set) |

`Identity { address, verified, country_code, role: IdentityRole::{KYC, KYB} }`.

### Entrypoints

- `initialize(env, admin)` — `admin.require_auth()`, sets `Admin`.
- `set_identity(env, user, verified, country_code, role, operator)` — admin-only; emits `VerificationSet { user, verified }`.
- `verify_identity(env, user)` — panics with `Unauthorized` / `IdentityNotFound` / `IdentityNotVerified` accordingly. **No `require_auth` here** — relied on by the token contract as an oracle call.
- `get_identity(env, user) -> Option<Identity>` — read-only.

### Errors

`Unauthorized`, `IdentityNotVerified`, `IdentityNotFound`, `AlreadyInitialized`.

### Storage pattern

Note `set_user_identity` reads the full `Map`, mutates, and writes it back. Fine for the user counts this contract is meant to serve; do not assume it scales to millions of entries.

---

## 4. Contract: `sep57`

**Purpose:** the actual fungible token. ERC-20-like surface, but every state change is gated by:

1. identity verification of every party (via `identity-verifier`),
2. compliance hooks on every transfer/mint/burn (via `compliance`),
3. an off-chain **admin permit** (ed25519 signature) for `mint` and `burn` only — `transfer` is permissionless for verified users.

### State (`storage.rs`)

| Key                            | Type                        | Meaning                                     |
| ------------------------------ | --------------------------- | ------------------------------------------- |
| `Initialized`                  | `bool`                      | one-time init guard                         |
| `Admin`                        | `Address`                   | calls `initialize`                          |
| `AdminSigner`                  | `BytesN<32>`                | ed25519 pubkey that signs mint/burn permits |
| `IdentityVerifier`             | `Address`                   | cross-contract handle                       |
| `Compliance`                   | `Address`                   | cross-contract handle                       |
| `Name` / `Symbol` / `Decimals` | `String` / `String` / `u32` | ERC-20 metadata                             |
| `Balance(Address)`             | `i128`                      | per-user balance                            |
| `TotalSupply`                  | `i128`                      | global supply                               |
| `UsedNonce(u64)`               | `bool`                      | replay protection on admin permits          |

### Entrypoints (`interface.rs`)

- `initialize(env, admin, identity_verifier, compliance, admin_signer, name, symbol, decimals)` — `admin.require_auth()`, one-shot.
- `mint(env, to, amount, nonce, deadline, signature: BytesN<64>)` — **requires a valid admin permit** (see below); also calls `identity_verifier.verify_identity(to)` and `compliance.created(...)`.
- `burn(env, from, amount, nonce, deadline, signature: BytesN<64>)` — same permit pattern, no identity check (admin is burning on behalf of holder).
- `transfer(env, from, to, amount)` — `from.require_auth()`; verifies both parties; calls `compliance.transferred(...)`; emits `Transfer { from, to, amount }`.
- Views: `balance`, `total_supply`, `identity_verifier`, `compliance`, `name`, `symbol`, `decimals`.

### Admin permit (EIP-2612-style for mint/burn)

Implemented in `lib.rs` helpers `require_admin_permit` + `permit_message`:

1. Reject if `ledger.sequence() >= deadline` → `PermitExpired`.
2. Reject if `nonce` already used → `PermitAlreadyUsed`.
3. Build canonical message:
   ```
   b"SEP57_PERMIT_V1"
   || u8(action)          // 1 = mint, 2 = burn
   || len(contract_addr) || contract_addr_str
   || len(account_addr)  || account_addr_str
   || i128::BE(amount)
   || u64::BE(nonce)
   || u32::BE(deadline)
   ```
4. `env.crypto().ed25519_verify(&admin_signer, &message, &signature)`.
5. Mark nonce used.

> Addresses are encoded as `len_be_bytes || utf8(str)` — not their raw 32-byte contract-account form. The signing tooling in `scripts/src/sign-mint.ts` and `sign-burn.ts` must use the same encoding (String conversion via `Address.toString()`).

### Cross-contract wiring (`external.rs`)

`#[contractclient]` generates `IdentityVerifierClient` and `ComplianceClient`. Token uses these from `lib.rs` helpers `identity_client` / `compliance_client`. The token **trusts** both contracts to enforce their own invariants — if either is misconfigured at deploy time, the token's guarantees break.

### Errors

`Unauthorized`, `InvalidAmount`, `InsufficientBalance`, `ArithmeticOverflow`, `PermitExpired`, `PermitAlreadyUsed`, `AlreadyInitialized`.

### Events

`Initialized`, `Mint { to, amount }`, `Transfer { from, to, amount }` (both addresses are topics), `Burn { from, amount }`.

---

## 5. End-to-End Flow

```
deploy order: identity-verifier → compliance → sep57
                │                  │             │
                ▼                  ▼             ▼
           initialize(admin)  initialize(operator)  initialize(admin,
                                                                 identity_verifier,
                                                                 compliance,
                                                                 admin_signer_pk,
                                                                 name, symbol, decimals)

admin then:
  compliance.bind_token(sep57_addr, operator)
  compliance.set_max_balance(sep57_addr, CAP, operator)
  identity-verifier.set_identity(user, true, "US", KYC, admin)
  sign permit off-chain → mint(to, amount, nonce, deadline, sig)
  sep57.mint(...)                 # calls identity.verify_identity(to)
                                  #       + compliance.created(snapshot, amount, self)
                                  # emits Mint event

user → user (verified):
  sep57.transfer(from, to, amount)  # from.require_auth()
                                   # identity.verify_identity(from) + (to)
                                   # compliance.transferred(snapshots, amount, Standard, self)
                                   # emits Transfer event

admin signs burn permit → sep57.burn(...)
                                   # compliance.destroyed(snapshot, amount, self)
                                   # emits Burn event
```

---

## 6. Quick Reference — Public Trait Signatures

```rust
// identity-verifier
trait IdentityVerifierInteface {
    fn initialize(env: Env, admin: Address);
    fn verify_identity(env: Env, user: Address);
    fn set_identity(env: Env, user: Address, verified: bool,
                    country_code: String, role: IdentityRole, operator: Address);
    fn get_identity(env: Env, user: Address) -> Option<Identity>;
}

// compliance
trait ComplianceInterface {
    fn initialize(env: Env, operator: Address);
    fn bind_token(env: Env, token: Address, operator: Address);
    fn unbind_token(env: Env, token: Address, operator: Address);
    fn set_max_balance(env: Env, token: Address, max_balance: i128, operator: Address);
    fn is_token_bound(env: Env, token: Address) -> bool;
    fn max_balance(env: Env, token: Address) -> i128;
    fn created(env: Env, to: AccountSnapshot, amount: i128, token: Address);
    fn transferred(env: Env, from: AccountSnapshot, to: AccountSnapshot,
                   amount: i128, kind: TransferKind, token: Address);
    fn destroyed(env: Env, from: AccountSnapshot, amount: i128, token: Address);
}

// sep57
trait Sep57Interface {
    fn initialize(env: Env, admin: Address, identity_verifier: Address,
                  compliance: Address, admin_signer: BytesN<32>,
                  name: String, symbol: String, decimals: u32);
    fn mint(env: Env, to: Address, amount: i128, nonce: u64,
            deadline: u32, signature: BytesN<64>);
    fn burn(env: Env, from: Address, amount: i128, nonce: u64,
            deadline: u32, signature: BytesN<64>);
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, user: Address) -> i128;
    fn total_supply(env: Env) -> i128;
    fn identity_verifier(env: Env) -> Address;
    fn compliance(env: Env) -> Address;
    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
    fn decimals(env: Env) -> u32;
}
```

---

## 7. Conventions & Gotchas

- **Auth model is mixed**: `transfer` uses standard `require_auth`; `mint`/`burn` use off-chain ed25519 permits against a fixed `admin_signer` pubkey. The token's `admin` is who can call `initialize` only.
- **Compliance is per-receiver on transfers** — sender is not capped. Burns are not capped at all.
- **`compliance.transferred` ignores the `from` snapshot** beyond passing it through; the only enforcement is on the receiver's post-balance.
- **`frozen` in `AccountSnapshot` is unused** — reserved for future freeze logic.
- **Permit message format is bespoke** (`SEP57_PERMIT_V1` + length-prefixed address strings). Any change here is a hard break with the off-chain signer in `scripts/src/sign-mint.ts` / `sign-burn.ts`.
- **State lives in `instance()` storage** for all three contracts. Bumping the contract (different wasm hash) without a migration plan is destructive.
- **Module names**: `IdentityVerifierInteface` (typo) and `IdentityRole` (in `external.rs`) intentionally mirror the `identity-verifier` contract to keep cross-contract types aligned.
- **Re-initialization is panics, not no-op** — every contract uses `if is_initialized { panic!(AlreadyInitialized) }` as the guard.
- **`factory` is scaffolding** (`hello_world`-style); ignore unless explicitly building it out.
