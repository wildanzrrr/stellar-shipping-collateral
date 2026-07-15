#!/bin/bash
set -e
JSON="$1"
NET="testnet"
FACTORY=$(jq -r .factory $JSON)
SHIPPER=$(jq -r .shipper $JSON)
TOKEN_ID=$(jq -r .token_id $JSON)
RAISE=$(jq -r .raise_amount $JSON)
INT=$(jq -r .interest_bps $JSON)
DUE=$(jq -r .due_ledger $JSON)
NAME=$(jq -r .name $JSON)
SYM=$(jq -r .symbol $JSON)
SALT=$(jq -r .salt $JSON)
NONCE=$(jq -r .nonce $JSON)
DL=$(jq -r .deadline $JSON)
SIG=$(jq -r .mint_signature $JSON)
SRC="wildanzrrr"
stellar contract invoke \
  --network "$NET" \
  --id "$FACTORY" \
  --source "$SRC" \
  -- create_rwa_token \
  --shipper "$SHIPPER" \  --token_id "$TOKEN_ID" \  --raise_amount "$RAISE" \
  --interest_bps "$INT" \
  --due_ledger "$DUE" \
  --name "$NAME" \
  --symbol "$SYM" \
  --salt "$SALT" \
  --nonce "$NONCE" \
  --deadline "$DL" \
  --mint_signature "$SIG"
