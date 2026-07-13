# RWA Tokenization & Issue-Collateral Flow

How the NestJS backend drives the Soroban **factory** contract to tokenize a real-world asset (a maritime receivable) into a SEP-57 offering. The backend never holds shipper keys — it *prepares* transactions, the shipper signs them via DFNS on the frontend, and the backend submits the signed XDR to Soroban RPC.

All Stellar/Soroban interaction lives in [`src/blockchain/blockchain.service.ts`](../src/blockchain/blockchain.service.ts); domain orchestration in [`src/rwa/rwa.service.ts`](../src/rwa/rwa.service.ts); HTTP surface in [`src/rwa/rwa.controller.ts`](../src/rwa/rwa.controller.ts).

---

## 1. Contracts involved

| Contract            | Testnet id (from generated bindings) | Role in this flow                                                    |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `factory`           | `CBUNBDBR…`                          | `create_rwa_token` — deploys the SEP-57 token + records the offering |
| `sep57`             | deployed per-offering                | the RWA token; `mint` is gated by identity + admin permit           |
| `identity-verifier` | `CBAJGMXC…`                          | `verify_identity(addr)` oracle called inside sep57 mint/transfer    |
| USDC (SAC)          | `CBIELTK6…`                          | payment token; upfront fee pulled via `transfer_from`               |

Contract ids come from the generated bindings' `networks.testnet.contractId` — **not** env vars. See `src/packages/*/dist/index.js`.

---

## 2. What `create_rwa_token` does on-chain

A single `create_rwa_token` invocation (see `contracts/factory/src/lib.rs`) chains several cross-contract calls. In simulation order:

1. `identity_verifier.get_identity(shipper)` — the shipper must be verified (KYB).
2. **`usdc.transfer_from(factory, shipper, factory, upfront)`** — pulls the upfront interest + protocol fee. `upfront = raise_amount * (interest_bps + protocol_fee_bps) / 10_000`.
3. Deploys + initializes a new sep57 token (deterministic address from factory + salt).
4. **`sep57.mint(factory, raise_amount, nonce, deadline, signature)`** — mints the whole raise to the factory. Internally calls `identity_verifier.verify_identity(factory)` and validates the admin **mint permit** signature.

Because Soroban allows **exactly one host-function op per transaction**, everything above happens in one tx — but the two external prerequisites (allowance + verified factory) must already be satisfied.

---

## 3. Prerequisites (or `create_rwa_token` traps)

| Prerequisite                             | Why                                                   | Failure if missing                                    | How it's satisfied                                                        |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Shipper is KYB-verified                  | `get_identity(shipper)`                               | `Error(Contract, #3)` NotVerified                     | Sumsub webhook → `BlockchainService.syncIdentity` (see [sumsub.md](sumsub.md)) |
| **Shipper approved factory as spender**  | `transfer_from` needs a USDC allowance                | token SAC: `Error(Contract, #9)` "not enough allowance" | **approve step** — see §4                                                 |
| Shipper holds ≥ `upfront` USDC           | `transfer_from` also needs balance                    | insufficient balance                                  | fund the shipper wallet (faucet / admin transfer)                         |
| **Factory is a verified identity**       | `sep57.mint(to=factory)` → `verify_identity(factory)` | `Error(Contract, #3)` NotVerified                     | **one-time deploy bootstrap** — see §6                                    |

---

## 4. The two-signature issue-collateral flow

Frontend hook: [`frontend/app/app/(protected)/collateral/new/use-issue-collateral.ts`](../../frontend/app/app/(protected)/collateral/new/use-issue-collateral.ts). Because the allowance must be on-chain *before* `create_rwa_token` simulates, and each is a separate Soroban tx, the shipper signs **twice**:

```
1. POST /rwa/approve-factory   → prepareApproveFactory  → txXdr
   DFNS sign (passkey #1) → POST /rwa/submit → poll to SUCCESS
2. POST /rwa/create-token      → prepareCreateRwaToken  → txXdr
   DFNS sign (passkey #2) → POST /rwa/submit → poll to SUCCESS
3. POST /collateral            → local collateral record linked to the RWA
```

- **`prepareApproveFactory`** builds a USDC `approve(shipper, factory, upfront, expiration_ledger)`. `upfront` is computed from the **same** `raiseAmount` passed to `create_rwa_token` (and `protocol_fee_bps` read live from the factory) so the allowance always covers the pull.
- Step 1 **must** land in a ledger before step 2 — `submitTransaction` polls `getTransaction` so the create simulation observes the applied allowance.

---

## 5. Transaction-assembly conventions (important gotchas)

These live in `BlockchainService` and apply to every prepared Soroban tx:

- **Surface simulation failures.** The SDK's `AssembledTransaction.simulate()` does **not** throw on a failed simulation — it silently leaves `.built` as the raw, un-assembled tx (base fee only, no Soroban footprint). Submitting that yields a useless network-level `txMALFORMED` (`errorResultXdr` = `AAAAAAAAAAD////wAAAAAA==`, result code −16) that hides the real contract error. `RwaService.assertSimulationSucceeded` throws with the actual Soroban diagnostic (e.g. "not enough allowance to spend") instead. **Never submit `assembledTx.built` without checking simulation success first.**
- **Convert address auth → source-account auth.** Simulation produces `sorobanCredentialsAddress` entries for the shipper's `require_auth`. DFNS signs only the transaction *envelope*, not per-entry Soroban auth. Since the shipper is always the tx source, `BlockchainService.convertShipperAuthToSourceAccount(xdr)` rewrites those entries to `sorobanCredentialsSourceAccount`, which the envelope signature satisfies. (Note: `Transaction.operations[i]` for `invokeHostFunction` exposes `.auth` directly — there is **no** `op.body.value.auth`; operate on the envelope XDR.)
- **Submit = send + poll.** `rpcServer.sendTransaction` only returns `PENDING` (never `SUCCESS`). `BlockchainService.submitTransaction` returns `FAILED` immediately on `ERROR`, otherwise polls `getTransaction` (≈20 × 1s) and returns the final `SUCCESS`/`FAILED` with `errorResultXdr`.

---

## 6. Deploy bootstrap: register the factory identity (one-time)

`sep57.mint` sends the raise to the factory and calls `verify_identity(factory)`, so the **factory contract address must be a verified identity**. This is a per-deployment setup step (mirrors `contracts/factory/src/test.rs`, which registers the factory as KYC).

```bash
cd backend
node --env-file=.env scripts/register-factory-identity.mjs
```

The script ([`scripts/register-factory-identity.mjs`](../scripts/register-factory-identity.mjs)) calls `identity_verifier.set_identity(factoryId, verified=true, …)` with the admin key. Run it once whenever the factory or identity-verifier is (re)deployed. Verify with a read-only `get_identity(factoryId)` simulation.

---

## 7. Endpoints (`RwaController`, base `/api/v1/rwa`)

| Method + path                | Handler                  | Purpose                                              |
| ---------------------------- | ------------------------ | ---------------------------------------------------- |
| `POST /approve-factory`      | `prepareApproveFactory`  | Prepare USDC approve (shipper → factory) for signing |
| `POST /create-token`         | `prepareCreateRwaToken`  | Prepare `create_rwa_token` for signing               |
| `POST /:rwaId/collect-fund`  | `prepareCollectFund`     | Prepare `collect_fund` for signing                   |
| `POST /:rwaId/settle-debt`   | `prepareSettleDebt`      | Prepare `settle_debt` for signing                    |
| `POST /submit`               | `submitSignedTransaction`| Submit a DFNS-signed XDR + poll for the result       |
| `GET  /`, `GET /:rwaId`, …   | `listRwas` / `getRwa` / … | Read offerings + events, joined with local collateral |

All prepare-endpoints require `req.user.walletAddress` (the shipper) and return the `{ success, message, data, statusCode }` envelope with `data.txXdr`.

---

## 8. Known issue — `raiseAmount` scaling

`raiseAmount` is currently passed **raw** to the contract (`BigInt(payload.raiseAmount)`), but the contract treats it as USDC base units (10^7 scale) — the DTO comment says "whole USDC". So `raiseAmount: 20` mints a 20-*stroop* raise (0.000002 USDC), not 20 USDC. Fixing requires scaling by `USDC_SCALE` consistently across the **mint permit signature**, `create_rwa_token`, and the `approve` amount (they must all agree). Not yet fixed — see `blockchain.service.ts` `USDC_SCALE`.
