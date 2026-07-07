# SEP57 Contracts — Agent Guide

> A Soroban workspace implementing a permissioned, identity-gated, compliance-bound
> token (SEP-57 style) with three core contracts and a full factory that mints
> real-world-asset offerings on demand.

---

## 1. Workspace at a Glance

```
contract/
├── Cargo.toml                  # workspace: resolver=2, members=contracts/*, soroban-sdk=25
├── Makefile                    # deploy + initialize targets (load .env)
├── contracts/
│   ├── compliance/             # rules engine: token binding + per-token max balance
│   ├── identity-verifier/      # KYC/KYB registry, gated by admin
│   ├── sep57/                  # the token itself (mint/transfer/burn, admin-permit gated)
│   └── factory/                # creates + manages RWA offerings end-to-end
└── target/                     # cargo build artifacts
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

| Code | Variant               | Trigger                                                          |
| ---- | --------------------- | ---------------------------------------------------------------- |
| 1    | `Unauthorized`        | contract not initialized OR caller not admin (in `set_identity`) |
| 2    | `IdentityNotVerified` | user exists but `verified: false`                                |
| 3    | `IdentityNotFound`    | no entry for user                                                |
| 4    | `AlreadyInitialized`  | double-init                                                      |

### Storage pattern

Note `set_user_identity` reads the full `Map`, mutates, and writes it back. Fine for the user counts this contract is meant to serve; do not assume it scales to millions of entries.

> **Important**: any contract address the token may pay **or** check identity on (e.g. the factory, which is the `to` of the initial mint) must be registered with `verified: true`. Otherwise `verify_identity(factory_addr)` returns `IdentityNotFound` and the mint traps.

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

## 5. End-to-End Flow (sep57 only)

For the factory-driven RWA flow (deploy → create → buy → collect → settle → claim), see §7.

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

## 6. Contract: `factory`

**Purpose:** orchestrates the lifecycle of an RWA offering — from a shipper creating a token and pulling the upfront fees, through KYC investors buying shares, the shipper collecting the raise, settling the debt at maturity, and investors claiming principal + interest. Holds USDC + the RWA tokens in escrow the whole time.

The factory is the **admin** of every sep57 token it deploys. It is the only address authorized to drive transfers out of the escrow (via the `from.require_auth()` check on the contract invoker for token `transfer`s) and to relay admin permits on the token.

### Constants (`lib.rs`)

| Name                     | Value       | Meaning                                                                               |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------- |
| `MAX_INTEREST_BPS`       | `950`       | cap on per-offering interest rate (9.5%)                                              |
| `RWA_DECIMALS`           | `7`         | matches USDC — simplifies accounting                                                  |
| `COMPLIANCE_MAX_BALANCE` | `i128::MAX` | per-token cap; lifted at bind time so factory minting the full raise is never blocked |

### State (`types.rs` + `storage.rs`)

| Key                   | Type               | Meaning                                                                  |
| --------------------- | ------------------ | ------------------------------------------------------------------------ |
| `Initialized`         | `bool`             | one-time init guard                                                      |
| `Admin`               | `Address`          | only signer of `withdraw_fees` and `emergency_withdraw`                  |
| `AdminSigner`         | `BytesN<32>`       | ed25519 pubkey used by token permits (mirrors sep57)                     |
| `IdentityVerifier`    | `Address`          | cross-contract handle                                                    |
| `Compliance`          | `Address`          | cross-contract handle                                                    |
| `Usdc`                | `Address`          | the USDC SAC / MockToken handle                                          |
| `ProtocolFeeBps`      | `i128`             | factory's cut on every raise (bps); default `50` (= 0.5%) if unset       |
| `Sep57WasmHash`       | `BytesN<32>`       | wasm of the token contract to deploy per offering                        |
| `RWAs`                | `Map<String, RWA>` | full per-offering state, keyed by the caller-chosen `rwa_id`             |
| `RWAByToken(Address)` | `String`           | reverse index: token addr → rwa id (stored alongside `RWAs` for the API) |

There is **no auto-incremented `NextRwaId`** — the shipper picks `rwa_id` and `token_id` as caller-supplied `String`s (see `create_rwa_token` below). This is what lets a shipper derive deterministic off-chain IDs from human-meaningful slugs (e.g. `"TKN-1"`) and what makes the contract a multi-tenant factory.

`RWA { id: String, token: Address, shipper: Address, raise_amount: i128, interest_bps: i128, protocol_fee_bps: i128, interest_pool: i128, protocol_fee_pool: i128, principal_pool: i128, shares_total: i128, shares_reserved: i128, shares_bought: i128, investors: Map<Address, i128>, due_ledger: u32, status: RWAStatus }`.

- `protocol_fee_bps` is **snapshotted on the offering at create time**, not read from the live factory default. Renaming the factory default later does not retroactively change existing offerings' protocol fees.
- `shares_reserved` is a legacy field: stored on the offering (kept at 0) for storage-layout compatibility with older RWAs but is **not** part of `shares_available()`. The current formula is `shares_available = shares_total - shares_bought`.
- Storage is `load_rwas()` → mutate → `save_rwas()` (the map is read into a `Map<String, RWA>`, mutated, and written back), matching the pattern used by `identity-verifier` for its `Users` map.

`RWAStatus`:

- `Open = 1` — accepting `buy_shares`
- `Funded = 2` — `shares_available == 0`; ready for `collect_fund` + `settle_debt`
- `Settled = 3` — principal repaid; investors may `claim`

### Entrypoints

#### `initialize(env, admin, identity_verifier, compliance, usdc, admin_signer, sep57_wasm_hash, protocol_fee_bps)`

One-shot. `admin.require_auth()`. Stores all cross-contract handles and the wasm hash. `require_bps(protocol_fee_bps)` — must be in `[0, 10_000]` (the generic bps guard). The 950 cap is on per-offering `interest_bps`, not on `protocol_fee_bps`.

#### `create_rwa_token(env, shipper, rwa_id, token_id, raise_amount, interest_bps, due_ledger, name, symbol, salt, nonce, deadline, mint_signature)`

Full RWA spin-up. **Shipper** signs (the one whose USDC is being pulled). Preconditions:

- factory `Initialized`
- `shipper` has `IdentityRole::KYB` in the verifier
- `raise_amount > 0`, `1 <= interest_bps <= 950`, `due_ledger > ledger.sequence()`
- mint permit `deadline > ledger.sequence()` (cheap upfront reject)
- `rwa_id` not already present in `RWAs` (otherwise `RwaAlreadyExists`)
- `token_id` is the off-chain-chosen slug for the **deployed token's contract address**; the factory does not derive it from `salt`. The off-chain `scripts/sign-create-rwa-token.ts` writes both `rwa_id` and `token_id` into `create_rwa_token.json` (defaulting them to the same string), and the factory treats them as opaque labels — it only stores `token_id` as `offering.id` (the `RWA.id` field) and as the key in `RWAs`.

Mechanics, in order:

1. Compute fees: `interest_fee = raise_amount * interest_bps / 10_000`, `protocol_fee = raise_amount * protocol_fee_bps / 10_000`, `upfront = interest_fee + protocol_fee`.
2. `usdc.transfer_from(shipper, factory, upfront)` — pulls interest pool + protocol fee from shipper. **Shipper must have approved the factory for ≥ `upfront` USDC.**
3. Deploy sep57 deterministically: `env.deployer().with_current_contract(salt).deploy_v2(sep57_wasm_hash, ())`. The deployed address is a pure function of `(factory_address, salt, network_id)`. **The deploy is keyed on `salt`, not `token_id` — `token_id` is a label, `salt` is the address-shaping input.**
4. `sep57.initialize(factory, identity_verifier, compliance, admin_signer, name, symbol, 7)` — **factory is the token's admin**.
5. `compliance.bind_token(token, factory)` and `compliance.set_max_balance(token, i128::MAX, factory)`.
6. `sep57.mint(factory, raise_amount, nonce, deadline, mint_signature)` — the factory mints the full raise to itself. The mint permit is signed off-chain by `admin_signer` over `(action=1, account=factory, amount=raise_amount, contract=token)`. The factory must be verified KYC/KYB in the identity verifier, otherwise step 6 traps with `IdentityNotFound`.
7. Store `RWA { id: token_id, ... }` with `status = Open`, `shares_reserved = 0`, `investors = empty`, `protocol_fee_bps = storage::protocol_fee_bps(env)` (the live factory default, snapshotted). Also call `set_rwa_id_by_token(token, &token_id)` so the reverse index `RWAByToken(Address) -> String` is set.

The factory sells 100% of the raise to investors; the upfront interest + protocol fee are paid in **USDC**, not by holding back RWA tokens.

Emits `RWACreated { rwa_id: String, shipper, token, raise_amount, interest_bps, upfront }`.

> **The salt and signed mint permit must be computed off-chain against the predicted token address** (see §9). `rwa_id` and `token_id` are pure labels — pick whatever the shipper wants, and keep them stable for the lifetime of the offering.

#### `buy_shares(env, rwa_id: String, investor, amount)`

**Investor** signs. Preconditions:

- factory `Initialized`
- `rwa_id` exists in `RWAs` (else `RwaNotFound`)
- `investor` has `IdentityRole::KYC` in the verifier (else `NotVerified` → `WrongRole`)
- `amount > 0`
- `offering.status == Open` (else `RwaNotOpen`)
- `amount <= shares_available` (else `SharesExhausted`)
- investor has approved the factory for ≥ `amount` USDC

Mechanics:

1. `usdc.transfer_from(investor, factory, amount)` — pulls USDC par at 1:1.
2. `sep57.transfer(factory, investor, amount)` — moves RWA tokens from factory escrow to investor. (Factory is the token admin; it implicitly authorizes by being the contract invoker.)
3. Bump `shares_bought`, record investor allocation in `investors: Map<Address, i128>`.
4. `next_status`: if `shares_available() <= 0`, flip to `Funded`. Otherwise stay `Open`.

Emits `SharesBought { rwa_id: String, investor, amount }`.

> Once `Funded`, no more `buy_shares` calls succeed (`RwaNotOpen`). A fully bought offering drains the factory's RWA balance to 0 — all RWA lives in investor wallets; the factory is purely a USDC escrow.

#### `collect_fund(env, rwa_id: String, shipper)`

**Shipper** signs. Preconditions: factory initialized, `rwa_id` exists, caller matches `offering.shipper`. **Status is NOT checked** — `collect_fund` can be called while `Open`, `Funded`, or `Settled` (the typical call is right after the offering flips to `Funded`). Pulls `shares_bought` USDC out of the factory to the shipper. Does **not** change status.

> Note: `interest_pool` and `protocol_fee_pool` USDC are **not** moved here — they stay parked in the factory for the duration of the offering. The shipper only gets the principal it raised. If `collect_fund` is called before the offering is fully bought, the shipper receives the partial `shares_bought` USDC, but the offering can still receive more `buy_shares` calls.

Emits `FundCollected { rwa_id: String, shipper, amount: shares_bought }`.

#### `settle_debt(env, rwa_id: String, shipper, principal_amount)`

**Shipper** signs. Preconditions: factory initialized, `rwa_id` exists, caller matches `offering.shipper`, `principal_amount > 0`. **Status is NOT checked** — the shipper can pre-pay into the `principal_pool` any time. Pulls `principal_amount` USDC from the shipper back into the factory. `principal_pool += principal_amount`. **Does not change status** — `Settled` is set explicitly by `settle_debt` only if `principal_pool >= shares_bought` (i.e. fully repaid), otherwise the offering stays at its current status until it is.

> `principal_amount` should equal `shares_bought` (1 USDC per share sold). The factory does not enforce a single-call full repayment — partial settles are allowed. Status flips to `Settled` only when the pool covers the full raise.

Emits `DebtSettled { rwa_id: String, shipper, amount: principal_amount }`.

#### `claim(env, rwa_id: String, investor, amount, nonce, deadline, burn_signature)`

**Investor** signs. Preconditions:

- factory initialized, `rwa_id` exists
- `status == Settled` (else `RwaNotSettled`)
- `amount > 0`
- investor's recorded `investors[investor] >= amount` (else `InsufficientPool` — the `investors` map is the gate; this is checked **before** burn)
- `deadline > ledger.sequence()`

Mechanics:

1. `principal_pool >= amount` and `interest_pool >= amount * interest_bps / 10_000` checks (otherwise `InsufficientPool`). If the shipper underpaid, the failure mode is a clean factory error and the investor's RWA stays intact.
2. `sep57.burn(investor, amount, nonce, deadline, burn_signature)` — burns the investor's RWA. Permit is signed off-chain by `admin_signer` over `(action=2, account=investor, amount, contract=token)`.
3. Compute payout: `interest = amount * interest_bps / 10_000`, `payout = amount + interest`.
4. `usdc.transfer(factory, investor, payout)` — pays principal + interest.
5. `principal_pool -= amount`, `interest_pool -= interest`, `investors[investor] -= amount`.

Emits `Claimed { rwa_id: String, investor, principal, interest }`.

> An investor can `claim` in multiple partial calls (each requires its own signed burn permit). `claim` is idempotent against the user's RWA balance — burning the RWA is the constraint, not the `investors` map.

#### `withdraw_fees(env, rwa_id: String, admin)`

**Factory admin** signs. Preconditions: factory initialized, `rwa_id` exists, `caller == admin`. Pulls the full `protocol_fee_pool` for **that specific offering** to the admin. Resets the pool to 0. Status-agnostic (can be called while `Open`, `Funded`, or `Settled`). Use after `create_rwa_token` to skim the protocol fee for an open offering, or after `Settled` to clean up. Per-offering (the fee is taken from the offering's pool, not a global pool).

Emits `FeesWithdrawn { rwa_id: String, admin, amount: protocol_fee_pool_before }`.

#### `emergency_withdraw(env, token: Address, amount: i128, admin: Address)`

**Factory admin** signs. Generic token drain: `TokenClient::new(&env, &token).transfer(&env.current_contract_address(), &admin, &amount)`. **No accounting changes, no status checks, no role checks other than `caller == admin`.** The `token` parameter is a fully generic `Address` — this can be used to recover USDC accidentally sent to the factory, or to skim stuck RWA tokens in an emergency.

> Use with care. There is no audit trail in the factory state (no `withdrawn_emergency` map), only the `EmergencyWithdrawn { token, admin, amount }` event. The token must implement `transfer(from, to, amount)`, which USDC SAC and sep57 both do.

### Views

- `get_rwa(rwa_id: String) -> RWA` — full offering struct (single type, no `RWAView` split)
- `list_rwas() -> Vec<RWA>`
- `shares_bought(rwa_id: String) -> i128` — panics with `Unauthorized` if not initialized, `RwaNotFound` if id missing
- `investor_shares(rwa_id: String, investor: Address) -> i128` — same panic behavior
- `rwa_status(rwa_id: String) -> RWAStatus` — same panic behavior
- `rwa_id_by_token(token: Address) -> Option<String>` — reverse index lookup (returns `None` if the token was not deployed by this factory)
- `usdc()`, `identity_verifier()`, `compliance()`, `admin()`, `protocol_fee_bps() -> Address/Address/Address/Address/i128`

### Errors (`errors.rs`)

```
Unauthorized       = 1
InvalidAmount      = 2
NotVerified        = 3
RwaNotFound        = 4
RwaNotOpen         = 5
RwaNotSettled      = 6
SharesExhausted    = 7
InsufficientPool   = 8
AlreadyInitialized = 9
InvalidBps         = 10
InvalidDeadline    = 11
ArithmeticOverflow = 12
WrongRole          = 13   # thrown by `require_role` (factory side, mirrors identity-verifier)
RwaAlreadyExists   = 14
```

> `RwaNotFunded` is intentionally absent. The `Funded` state is informational — the only enforced status guards are `RwaNotOpen` (on `buy_shares`) and `RwaNotSettled` (on `claim`). `WrongRole` is thrown when an investor lacks `IdentityRole::KYC` or a shipper lacks `IdentityRole::KYB` (it surfaces as `NotVerified` from the verifier when the user is unknown — see §11).

### Events (`events.rs`)

`Initialized`, `RWACreated`, `SharesBought`, `FundCollected`, `DebtSettled`, `Claimed`, `FeesWithdrawn`, `EmergencyWithdrawn`. All carry `rwa_id: String` as a `#[topic]` (events emitted by the new `collect_fund` path use `FundCollected`; older versions emitted this from `settle_debt` — see §12).

---

## 7. End-to-End RWA Flow (shipper + investor perspective)

```
[Deploy]
stellar contract deploy --wasm identity_verifier.wasm   → IDENTITY_ADDRESS
stellar contract deploy --wasm compliance.wasm           → COMPLIANCE_ADDRESS
stellar contract deploy --wasm factory.wasm             → FACTORY_ADDRESS
stellar contract upload  --wasm sep57.wasm              → SEP57_WASM_HASH

[Initialize]
identity_verifier.initialize(ADMIN_ADDRESS)
compliance.initialize(FACTORY_ADDRESS)                  # factory is the operator
factory.initialize(
    ADMIN_ADDRESS, IDENTITY_ADDRESS, COMPLIANCE_ADDRESS,
    USDC_ADDRESS, ADMIN_SIGNER_PK, SEP57_WASM_HASH, 50)

[Register identities]
identity_verifier.set_identity(SHIPPER, true, "IDN", KYB, ADMIN)        # role=2
identity_verifier.set_identity(FACTORY, true, "ZZZ", KYC, ADMIN)        # role=1
identity_verifier.set_identity(INVESTOR, true, "IDN", KYC, ADMIN)       # role=1

[USDC allowances]
USDC.approve(FACTORY, 2_500_000)                # shipper → factory (interest + protocol)
USDC.approve(FACTORY, 100_000_000)              # investor → factory (full raise)

[Shipper creates offering]
# Off-chain:
rwa_id   = "TKN-1"             # caller-chosen slug, e.g. from issuer's ledger
token_id = "TKN-1"             # label stored on the offering; salt is what shapes the address
salt     = random 32 bytes
token    = predict_token_address(FACTORY, salt)   # see §9
permit   = ed25519_sign(ADMIN_SIGNER_SK,
          action=1, account=FACTORY, amount=10*1e7,
          contract=token, nonce, deadline)

# On-chain:
factory.create_rwa_token(
    shipper, "TKN-1", "TKN-1", 10*1e7, 200, due_ledger,
    "RWA Token", "RWA",
    salt, nonce, deadline, permit)
  → pulls 2.5M USDC from shipper (interest + protocol)
  → deploys token at predicted address
  → mints 100M RWA to factory
  → offering: id="TKN-1", status=Open, shares_available=100M (full raise for sale)

[Investor buys shares]
factory.buy_shares("TKN-1", INVESTOR, 100_000_000)
  → pulls 10 USDC from investor
  → moves 100M RWA from factory to investor
  → shares_bought=100M, shares_available=0
  → factory RWA balance = 0
  → status flips to Funded

[Shipper collects raise]
factory.collect_fund("TKN-1", SHIPPER)
  → transfers 10 USDC to shipper (the full raise, no upfront haircut)
  → status remains Funded
  → (interest + protocol pools still parked in factory)

[Time passes until due_ledger]

[Shipper repays]
factory.settle_debt("TKN-1", SHIPPER, 100_000_000)
  → pulls 10 USDC from shipper back into factory
  → principal_pool=10 USDC
  → status=Settled

[Investor claims]
# Off-chain:
burn_permit = ed25519_sign(ADMIN_SIGNER_SK,
              action=2, account=INVESTOR, amount=100_000_000,
              contract=token, nonce, deadline)

# On-chain:
factory.claim("TKN-1", INVESTOR, 100_000_000, nonce, deadline, burn_permit)
  → pre-flight: principal_pool ≥ 100M, interest_pool ≥ 2M
  → burns 100M RWA from investor
  → transfers 10 + 0.2 = 10.2 USDC to investor
  → principal_pool=0, interest_pool=0

[Factory admin skims protocol fee]
factory.withdraw_fees("TKN-1", ADMIN)
  → transfers 0.05 USDC to admin (0.5% of the 10 USDC raise)
  → protocol_fee_pool=0

[Optional: emergency recovery]
factory.emergency_withdraw(USDC_ADDRESS, 5_000_000, ADMIN)
  → generic TokenClient::transfer(USDC, 5 USDC, factory → admin)
  → no factory-state changes; only the EmergencyWithdrawn event is recorded
  → use to recover USDC accidentally sent to the factory, or to skim stuck tokens
```

---

## 8. Testnet Deployment Playbook

All commands assume `contract/.env` is populated (see `Makefile`):

```dotenv
SOURCE_ACCOUNT=danzrrr
NETWORK=testnet
ADMIN_ADDRESS=GAQG4...
ADMIN_SIGNER=206e40e9...         # 32-byte hex of ed25519 pubkey
IDENTITY_ADDRESS=CAHU...         # identity_verifier
COMPLIANCE_ADDRESS=CBFP...       # compliance
FACTORY_ADDRESS=CC6X...          # factory
USDC_ADDRESS=CBIE...             # MockToken (testnet USDC)
FACTORY_PROTOCOL_FEE_BPS=50
SEP57_WASM_HASH=465b053a...      # sha256 of sep57.wasm
```

```bash
# Build
cargo build --target wasm32v1-none --release
stellar contract build

# Deploy + initialize (from contract/)
make deployIdentity deployCompliance deployFactory uploadSEP57 \
     initializeIdentity initializeCompliance initializeFactory

# Confirm factory admin
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- admin

# Register identities (one-time per account)
stellar contract invoke --network testnet --source-account danzrrr \
  --id $IDENTITY_ADDRESS --send yes -- set_identity \
  --user <G_ADDR> --verified true --country_code "IDN" \
  --role 1 --operator $ADMIN_ADDRESS       # KYC investor
stellar contract invoke --network testnet --source-account danzrrr \
  --id $IDENTITY_ADDRESS --send yes -- set_identity \
  --user $FACTORY_ADDRESS --verified true --country_code "IDN" \
  --role 1 --operator $ADMIN_ADDRESS       # factory (1 = KYC)
# Shipper: role 2 = KYB
```

> **Note on the "no RWA reservation" fix**: a prior version of `create_rwa_token` reserved `upfront` RWA tokens for the interest + protocol-fee pool, which meant the shipper only received `raise_amount - upfront` USDC on `collect_fund` (losing the upfront net of any reimbursement), and `claim` would trap with `InsufficientPool` because there was not enough USDC to pay principal + interest to the burner. The current implementation sells 100% of the raise to investors and collects the fees in USDC instead. The old factory (`CC6X37...`) is abandoned. RWA #1 in the table below is the first offering from the new (fixed) factory and has not yet been created on-chain — deploy + smoke-test steps are in §8.1.

### Known-good testnet state (verified July 2026)

| Item                        | Address / value                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ADMIN_ADDRESS` (`danzrrr`) | `GAQG4QHJTX4NHPEKSU6UE4NABDUV673HL6QCRSAJRYFWTAAPVKJU2QIH`                                                   |
| `IDENTITY_ADDRESS`          | `CAHUXEIDZFKW2DAWQK7PSGBTYQPLLNI5OXXOQH2UYHRYPXAFWWV5ALAZ`                                                   |
| `COMPLIANCE_ADDRESS`        | `CBFP6A34V6ENVEN4Q73WJDLUFWAS2JKQUFFMGIMQEHJ43TQUNQZH4QJF`                                                   |
| `FACTORY_ADDRESS`           | `CD7UMCF4FSTZXDAWCJQRYPT4DYFDJX5KMKWLJXQ5U4MUJSWPUWXPV5LO` (new, sells 100%)                                 |
| `FACTORY_ADDRESS` (old)     | `CC6X37DF4I4MTSZUBNOH6MZOYYV3YUVDS3O4AEV7QM232ROSMNE7C67D` — **abandoned**, used buggy reservation           |
| `USDC_ADDRESS` (MockToken)  | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`                                                   |
| `SHIPPER` (`wildanzrrr`)    | `GAEKPXZW3FNQ4YCLNQSMUWCZZPFQG476UCASLEJNXIFNMGYSGAWTN5L4` (KYB)                                             |
| `protocol_fee_bps`          | `50`                                                                                                         |
| factory wasm hash           | `6e4420f6b70bcecc9932cf3d877ede72666bdbfddc8af42a20693fb8f238b6c2`                                           |
| sep57 wasm hash             | `0d44824e0b28a207d2b588edef1d38661fe999a27fc0f3a45ebfdf226fb4587e`                                           |
| RWA offering #1 token       | _not yet deployed — see §8.1_ (will be tracked by `rwa_id="TKN-1"` and `token_id="TKN-1"` once smoke-tested) |

### Verifying state from CLI

```bash
# RWA details
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- get_rwa --rwa_id "TKN-1"

# Status code
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- rwa_status --rwa_id "TKN-1"
# 1=Open, 2=Funded, 3=Settled

# Investor allocation
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- investor_shares --rwa_id "TKN-1" --investor <G_ADDR>

# Reverse index: token → rwa_id
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- rwa_id_by_token --token <RWA_TOKEN>

# RWA token balance (note: arg is --user, not --id)
stellar contract invoke --network testnet --source-account danzrrr \
  --id <RWA_TOKEN> -- balance --user <G_ADDR>

# USDC allowance for the factory
stellar contract invoke --network testnet --source-account danzrrr \
  --id $USDC_ADDRESS -- allowance --from <G_ADDR> \
  --spender $FACTORY_ADDRESS
```

### §8.1 New factory smoke test (post-redo)

The new factory is live, initialized, and registered in the identity verifier (role=1, country="IDN"). To run the first end-to-end offering:

```bash
cd contract
# 1) Build (idempotent; wasm hash printed by the build)
cargo build --target wasm32v1-none --release
ls -la target/wasm32v1-none/release/factory.wasm target/wasm32v1-none/release/sep57.wasm

# 2) Confirm factory admin
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- admin
# → "GAQG4QHJTX4NHPEKSU6UE4NABDUV673HL6QCRSAJRYFWTAAPVKJU2QIH"

# 3) Sign a create_rwa_token payload (interactive)
cd ../scripts
ADMIN_SECRET=SASDLZR74W5SVCIAL5WPS7AKMFZNFVMIIZEHCDNETH4JUZHI5LLBHN75 \
  pnpm sign:create-rwa-token
# prompts: factory=CD7UMCF4..., shipper=GAEKPXZW3..., raise=10 USDC,
#          interest=2%, name/symbol optional, salt auto, rwa_id="TKN-1",
#          token_id="TKN-1" (both default to the same slug — caller can change them).
# emits JSON with `rwa_id`, `token_id`, `token` (predicted address),
# `mint_signature`, `nonce`, `deadline`.

# 4) Invoke factory.create_rwa_token with the JSON
./invoke_args.sh ./create_rwa_token.json
# On success: mints shares_total == raise_amount to the new token,
# pulls (interest + protocol) USDC from shipper, sets status=Open,
# shares_reserved=0, shares_bought=0, shares_available=raise_amount.

# 5) Verify the offering (rwa_id = "TKN-1")
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- get_rwa --rwa_id "TKN-1"
# Assert: shares_reserved=0, shares_available=raise_amount (not raise_amount - upfront).

# 6) Investor (danzrrr) buys 100% of the raise
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS --send yes -- buy_shares \
  --rwa_id "TKN-1" --investor <G_DANZRRR> --amount <raise_amount>

# 7) Verify the buy
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS -- investor_shares --rwa_id "TKN-1" --investor <G_DANZRRR>
# → raise_amount (e.g. 100_000_000 raw = 10 USDC worth of shares)
stellar contract invoke --network testnet --source-account danzrrr \
  --id <RWA_#1_TOKEN> -- balance --user $FACTORY_ADDRESS
# → 0  (factory sold 100%, holds nothing)

# 8) Shipper collects the full raise (no longer loses the upfront)
stellar contract invoke --network testnet --source-account wildanzrrr \
  --id $FACTORY_ADDRESS --send yes -- collect_fund --rwa_id "TKN-1"
# Shipper USDC balance back at initial.

# 9) Investor claims (after due_ledger)
stellar contract invoke --network testnet --source-account danzrrr \
  --id <RWA_#1_TOKEN> -- allowance --from <G_DANZRRR> --spender $FACTORY_ADDRESS
# Pre-claim: set allowance on the RWA token, then:
stellar contract invoke --network testnet --source-account danzrrr \
  --id $FACTORY_ADDRESS --send yes -- claim \
  --rwa_id "TKN-1" --investor <G_DANZRRR> --amount <raise_amount> \
  --nonce <n> --deadline <d> --burn_signature <hex>
# Burns shares, pays principal + interest from the factory USDC pool.
```

After smoke test passes, update the table above with the new RWA token address and the final USDC/RWA balances for both `wildanzrrr` and `danzrrr`.

---

## 9. Off-Chain Token Address Prediction

The factory deploys sep57 via `env.deployer().with_current_contract(salt).deploy_v2(hash, ())`. To sign the mint permit **before** the token exists on chain, you must reproduce the host's contract-ID derivation:

```
deployer   = raw 32-byte hash decoded from the factory's C... strkey
networkId  = sha256(networkPassphrase)
preimage   = HashIdPreimage {
  networkId,
  contractIdPreimage: {
    address: ScAddress::Contract(deployer),
    salt,
  }
}
token      = StrKey::encodeContract(sha256(preimage.toXDR()))
```

- Network passphrase: `Test SDF Network ; September 2015` (testnet) or `Public Global Stellar Network ; September 2015` (public).
- The preimage is 108 bytes once XDR-encoded; the discriminant for `envelopeTypeContractId` in this SDK is `0x00000008`.
- A naive `sha256(deployer || salt)` produces a _different_ address and will cause the on-chain mint to fail ed25519 verification.

The reference implementation lives in `scripts/src/lib.ts::predictTokenAddress`. Always cross-check the prediction against `stellar contract invoke --id $FACTORY -- <claim-or-mint-on-the-predicted-token>` after a deploy is broadcast — if the addresses diverge, the prediction is wrong.

---

## 10. Quick Reference — Public Trait Signatures

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

// factory
trait FactoryInterface {
    fn initialize(env: Env, admin: Address, identity_verifier: Address,
                  compliance: Address, usdc: Address, admin_signer: BytesN<32>,
                  sep57_wasm_hash: BytesN<32>, protocol_fee_bps: i128);
    fn create_rwa_token(env: Env, shipper: Address,
                        rwa_id: String, token_id: String,
                        raise_amount: i128, interest_bps: i128, due_ledger: u32,
                        name: String, symbol: String, salt: BytesN<32>,
                        nonce: u64, deadline: u32, mint_signature: BytesN<64>);
    fn buy_shares(env: Env, rwa_id: String, investor: Address, amount: i128);
    fn collect_fund(env: Env, rwa_id: String, shipper: Address);
    fn settle_debt(env: Env, rwa_id: String, shipper: Address, principal_amount: i128);
    fn claim(env: Env, rwa_id: String, investor: Address, amount: i128,
             nonce: u64, deadline: u32, burn_signature: BytesN<64>);
    fn withdraw_fees(env: Env, rwa_id: String, admin: Address);
    fn emergency_withdraw(env: Env, token: Address, amount: i128, admin: Address);
    fn get_rwa(env: Env, rwa_id: String) -> RWA;
    fn list_rwas(env: Env) -> Vec<RWA>;
    fn shares_bought(env: Env, rwa_id: String) -> i128;
    fn investor_shares(env: Env, rwa_id: String, investor: Address) -> i128;
    fn rwa_status(env: Env, rwa_id: String) -> RWAStatus;
    fn rwa_id_by_token(env: Env, token: Address) -> Option<String>;
    fn usdc(env: Env) -> Address;
    fn identity_verifier(env: Env) -> Address;
    fn compliance(env: Env) -> Address;
    fn admin(env: Env) -> Address;
    fn protocol_fee_bps(env: Env) -> i128;
}
```

---

## 11. Conventions & Gotchas

- **Auth model is mixed**: `transfer` uses standard `require_auth`; `mint`/`burn` use off-chain ed25519 permits against a fixed `admin_signer` pubkey. The token's `admin` is who can call `initialize` only.
- **Factory is the token's admin**, so it's the only address that can drive `transfer` (and relay permits) on a token. Anyone who is not `admin` of a token must go through the factory for primary issuance.
- **The factory sells 100% of the raise.** The upfront interest + protocol fee is paid in USDC at `create_rwa_token`, not by holding back RWA. After a fully bought offering the factory holds 0 RWA — all RWA lives in investor wallets, and the factory is purely a USDC escrow.
- **The factory's USDC balance is the source of truth** for all `claim` payouts. `withdraw_fees` and `emergency_withdraw` are the only ways USDC leaves the factory other than the three lifecycles. The factory admin's key is hot.
- **Compliance is per-receiver on transfers** — sender is not capped. Burns are not capped at all.
- **`compliance.transferred` ignores the `from` snapshot** beyond passing it through; the only enforcement is on the receiver's post-balance.
- **`frozen` in `AccountSnapshot` is unused** — reserved for future freeze logic.
- **Permit message format is bespoke** (`SEP57_PERMIT_V1` + length-prefixed address strings). Any change here is a hard break with the off-chain signer in `scripts/src/sign-mint.ts` / `sign-burn.ts` and the factory's mint/burn call sites.
- **Token address prediction must use XDR-encoded `HashIdPreimage`** (§9). A naive `sha256(deployer || salt)` produces a different address and breaks mint permit verification.
- **`Status` discriminants** are not contiguous from 0: `Open=1`, `Funded=2`, `Settled=3`. Persist as the integer; do not cast through enums.
- **`IdentityRole` discriminants**: `KYC=1`, `KYB=2`. Investors must be `KYC`; shippers must be `KYB`. The factory surfaces the wrong role as `NotVerified` (from the verifier) or as a contract-level `WrongRole` for the `set_identity` callsite.
- **State lives in `instance()` storage** for all four contracts. Bumping the contract (different wasm hash) without a migration plan is destructive.
- **Module names**: `IdentityVerifierInteface` (typo) and `IdentityRole` (in `external.rs`) intentionally mirror the `identity-verifier` contract to keep cross-contract types aligned.
- **Re-initialization panics, not no-op** — every contract uses `if is_initialized { panic!(AlreadyInitialized) }` as the guard.
- **Investors claim by burning** RWA tokens. The RWA balance is the constraint; the factory's `investors` map is just accounting. If an investor's recorded allocation exceeds their actual RWA balance, `claim` will trap at the `burn` step.
- **`rwa_id` and `token_id` are caller-chosen `String`s, not auto-incremented.** The factory does not enforce any format — pick whatever the shipper wants (e.g. `"TKN-1"`, an invoice number, a UUID) and keep them stable for the offering's lifetime. `token_id` is stored on the offering as `RWA.id`; `rwa_id` is the map key in `RWAs`. The current `scripts/sign-create-rwa-token.ts` defaults both to the same slug. Duplicates are rejected with `RwaAlreadyExists`.
- **`salt` is what shapes the deployed token address**, not `token_id`. Two calls with the same `salt` will fail to deploy (the contract already exists at the predicted address).
- **`protocol_fee_bps` is snapshotted on the offering at create time.** Renaming the factory's `ProtocolFeeBps` storage later does not retroactively change existing offerings. Use `rwa.protocol_fee_bps` for an offering-specific read; the factory-level view is the default.
- **`withdraw_fees` is per-offering**, not a global pool. Each offering tracks its own `protocol_fee_pool` USDC; the admin claims each one individually.
- **`emergency_withdraw` is a generic `TokenClient::transfer`** — it does not touch `RWA`, the `investors` map, or any status. Use only for recovery. It is the only function that allows the admin to move USDC out of the factory without going through the RWA lifecycle.
- **`buy_shares` and `claim` are the only enforced status guards.** `collect_fund` and `settle_debt` are status-agnostic (the shipper can call them while `Open`, `Funded`, or `Settled` — useful for pre-funding the `principal_pool` or for partial `settle_debt` calls).
- **`claim` is partial-friendly**: investors can claim in slices (each requires its own signed burn permit). The `investors` map decrements with each claim.
- **The factory's `RWAs` map is read-modify-write** (`load_rwas() → mutate → save_rwas()`), mirroring `identity-verifier`'s `Users` map. Reads are O(1) (single `instance().get`); writes are O(n) over all RWAs. This is fine for the testnet scale but is the obvious bottleneck if the factory ever goes to thousands of offerings.
- **`compliance::Error::InvalidMaxBalance` is defined but never used.** `set_max_balance` rejects with `InvalidAmount` (via `require_positive`) — the name is misleading leftover from an earlier design. Don't add code that pattern-matches on it.
- **String `rwa_id` is the on-chain key everywhere.** Make sure CLI invocations pass `--rwa_id "TKN-1"` (with quotes — the CLI otherwise parses it as multiple args).
- **One offering per token address**: `with_current_contract(salt).deploy_v2(...)` will fail if `salt` collides with a previously deployed token from the same factory. Always generate a fresh random salt for a new offering.

---

## 12. Recent Refactors (factory)

The factory has been the most volatile contract. The changes below are accurate as of the current code; older testnet state (the abandoned `CC6X37…` factory) corresponds to older invariants.

| When   | Change                                                                                                               | Why                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| recent | `rwa_id: u64` → `rwa_id: String` (and `token_id: String` added as a 2nd caller-supplied label)                       | Lets a shipper pick meaningful slugs from their own ledger. Adds `RwaAlreadyExists` to reject duplicate map keys.  |
| recent | `RWAOffering` / `RWAView` split → single unified `RWA` struct                                                        | The view vs. internal split was redundant — the offering struct is small enough to be returned directly.           |
| recent | Removed `NextRwaId: u64` counter                                                                                     | The counter became meaningless once `rwa_id` is caller-chosen.                                                     |
| recent | Added `protocol_fee_bps: i128` to `RWA` (snapshotted at create time)                                                 | Per-offering fee; the factory-level `ProtocolFeeBps` is now only the default used at create time.                  |
| recent | Added `emergency_withdraw(token, amount, admin)`                                                                     | Generic `TokenClient::transfer` for the admin to recover funds. Does not touch any offering state or accounting.   |
| recent | `RWAByToken(Address)` value `u64` → `String`                                                                         | Reverse index now points at the string `rwa_id`. A new view `rwa_id_by_token(token) -> Option<String>` is exposed. |
| recent | `settle_debt` no longer flips status unconditionally; `Funded → Settled` only when `principal_pool >= shares_bought` | Multiple partial `settle_debt` calls can pre-fund the pool without prematurely closing the offering.               |
| recent | `collect_fund` is now status-agnostic                                                                                | Shippers can pull a partial raise as soon as the first `buy_shares` lands, without waiting for full subscription.  |
| recent | Added `FundCollected` event for `collect_fund`                                                                       | Old code reused `DebtSettled` for this path; split for observability.                                              |
| recent | `require_bps(protocol_fee_bps)` cap raised from `[0, 950]` to `[0, 10_000]` (the generic guard)                      | 950 was a typo — the 950 cap is on `interest_bps` only.                                                            |
| recent | Added `rwa_id: String` `#[topic]` to all factory events                                                              | Indexable by off-chain indexers via the string key.                                                                |
| recent | Test coverage on `factory/src/lib.rs` pushed to 100% (57/57 tests passing)                                           | Includes dedicated paths for `withdraw_fees`, the view helpers, and the panic lines in private guards.             |

### ABI break risk

`rwa_id: u64 → String` is a **breaking change** to the public ABI. Any off-chain client (CLI scripts, frontend, off-chain ledger) that previously called `factory.create_rwa_token(shipper, raise_amount, ...)` must now pass `rwa_id` and `token_id` as the 2nd and 3rd arguments. `scripts/src/sign-create-rwa-token.ts` already does this — when integrating, regenerate `create_rwa_token.json` and re-run the smoke test (§8.1).
