# SEP57 scripts

Off-chain helpers for the SEP57 Soroban token.

## Setup

```bash
cd scripts
npm install
cp .env.example .env
# fill in ADMIN_SEED_PHRASE (24-word BIP-39) and TOKEN_CONTRACT_ADDRESS
```

## Decode a G... address to the 32-byte ed25519 pubkey

This is the hex you pass as `admin_signer` to `initialize(...)`.

```bash
npm run decode -- GAQG4QHJTX4NHPEKSU6UE4NABDUV673HL6QCRSAJRYFWTAAPVKJU2QIH
# → 206e40e99df8d3bc8a953d4271a008e95f7f675fa028c8098e0b69800faa934d
```

## Sign a mint permit

```bash
TO_ADDRESS=GB... AMOUNT=1000000 \
TOKEN_CONTRACT_ADDRESS=CB... \
  npm run sign:mint
```

JSON output:

```json
{
  "contract": "CB...",
  "action": "mint",
  "to": "GB...",
  "amount": "1000000",
  "nonce": "1717600000000000",
  "deadline": 1717603600,
  "signature": "...",
  "signer": "GA..."
}
```

Pass `nonce`, `deadline`, `signature` to the contract's `mint(...)` along with `to` and `amount`.

## Sign a burn permit

```bash
FROM_ADDRESS=GB... AMOUNT=500000 \
TOKEN_CONTRACT_ADDRESS=CB... \
  npm run sign:burn
```

## Notes

- The permit message format mirrors `lib.rs::permit_message` byte-for-byte.
- Nonce is auto-generated; set `NONCE=...` to force a value.
- Deadline defaults to ~1h ahead (720 ledgers × 5s); set `DEADLINE_LEDGERS=...` to adjust.
- `Keypair.fromSecret` accepts either a raw `S...` secret or a BIP-39 phrase, but the contract's `ed25519_verify` only sees the 32-byte pubkey — make sure `ADMIN_SIGNER_ADDRESS` matches the seed you put in `ADMIN_SEED_PHRASE`.
