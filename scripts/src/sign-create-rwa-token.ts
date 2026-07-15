/**
 * Build a signed `create_rwa_token` invocation for the factory.
 *
 * Predicts the SEP57 token address the factory will deploy for the given
 * salt, then signs a mint permit over (token, action=mint, account=factory,
 * amount=raise_amount). The signed payload + the factory call arguments
 * are emitted as JSON ready to feed into `stellar contract invoke`.
 *
 * TTY-only. ADMIN_SECRET may be provided via env (kept for CI/scripting).
 * All other inputs are prompted interactively (with env-var fallbacks).
 *
 *   npm run sign:create-rwa-token
 *
 * Output (JSON): {
 *   factory, shipper, token_id, raise_amount, interest_bps, due_ledger, name, symbol,
 *   salt, token, nonce, deadline, mint_signature
 * }
 */
import prompts from "prompts";
import { randomBytes } from "node:crypto";
import {
  ask,
  buildPermitMessage,
  daysToLedgers,
  deadlineFromLatest,
  fetchLatestLedger,
  getNetworkPassphrase,
  isValidCAddress,
  isValidGAddress,
  keypairFromSecret,
  nextNonce,
  predictTokenAddress,
  toHex,
} from "./lib.js";

const onCancel = () => process.exit(1);

const factory = await ask({
  type: "text",
  name: "FACTORY_ADDRESS",
  message: "Factory contract address (C...)",
  validate: (v: string) =>
    isValidCAddress(v.trim()) ? true : "Not a valid C... contract address",
});

// Generate a token_id matching the backend's convention: tkn-<cuid2>.
// User can override with a custom id if needed.
const defaultTokenId = `tkn-${randomBytes(12).toString("hex")}`;
const tokenId = await ask({
  type: "text",
  name: "TOKEN_ID",
  message: "Token ID (blank for auto-generated)",
  initial: defaultTokenId,
  validate: (v: string) =>
    v.trim().length > 0 ? true : "Token ID is required",
});

const shipper = await ask({
  type: "text",
  name: "SHIPPER_ADDRESS",
  message: "Shipper address — KYB-verified (G...)",
  validate: (v: string) =>
    isValidGAddress(v.trim()) ? true : "Not a valid G... address",
});

const raiseAmountStr = await ask({
  type: "text",
  name: "RAISE_AMOUNT",
  message: "Raise amount in USDC (e.g. 10000 = 10K USDC, supports decimals)",
  validate: (v: string) => {
    const n = Number(v.trim());
    if (isNaN(n) || n <= 0) return "Must be > 0";
    const parts = v.trim().split(/[.,]/);
    if (parts.length > 2 || (parts[1]?.length ?? 0) > 7)
      return "Maximum 7 decimal places (USDC precision)";
    return true;
  },
});
const USDC_SCALE = 10_000_000n; // 10^7 — matches MockToken
const raiseAmount = BigInt(Math.round(Number(raiseAmountStr) * 10_000_000));

const interestBpsStr = await ask({
  type: "text",
  name: "INTEREST_BPS",
  message: "Interest in bps (e.g. 200 = 2%, cap 950 = 9.5%)",
  initial: "200",
  validate: (v: string) => {
    try {
      const n = BigInt(v.trim());
      return n > 0n && n <= 950n ? true : "Must be 1..950";
    } catch {
      return "Must be an integer";
    }
  },
});
const interestBps = BigInt(interestBpsStr);

const name = await ask({
  type: "text",
  name: "TOKEN_NAME",
  message: "Token name (e.g. 'Invoice #1')",
  initial: "RWA Token",
});

const symbol = await ask({
  type: "text",
  name: "TOKEN_SYMBOL",
  message: "Token symbol (e.g. 'INV1')",
  initial: "RWA",
});

const saltOverride = await ask(
  {
    type: "text",
    name: "SALT_HEX",
    message: "Salt as 64 hex chars (blank for random)",
    validate: (v: string) => {
      const t = v.trim();
      if (t === "") return true;
      return /^[0-9a-fA-F]{64}$/.test(t)
        ? true
        : "Must be 64 hex chars (32 bytes)";
    },
  },
  undefined,
  { allowEmpty: true },
);
const salt =
  saltOverride.trim() === ""
    ? new Uint8Array(randomBytes(32))
    : Uint8Array.from(Buffer.from(saltOverride.trim(), "hex"));

// Predict the token address the factory will deploy for this salt.
// This is the `contract` we sign the mint permit over.
const token = predictTokenAddress(factory, salt);

// Pull the latest ledger from Horizon so due/deadline line up with the
// actual chain (not wall clock — chain can drift seconds from real time).
const latestLedger = await fetchLatestLedger();
console.error(`Latest ledger from Horizon: ${latestLedger}`);

const overrides = await prompts(
  [
    {
      type: "number",
      name: "dueDays",
      message: "Due in days from now (default 30)",
      initial: 30,
      min: 1,
    },
    {
      type: "number",
      name: "deadlineHours",
      message: "Permit deadline in hours from now (default 1)",
      initial: 1,
      min: 1,
    },
    {
      type: "number",
      name: "nonce",
      message: "Nonce (blank for auto)",
    },
  ],
  { onCancel },
);
const nonce = nextNonce();
const dueLedger = deadlineFromLatest(
  latestLedger,
  daysToLedgers(overrides.dueDays),
);
// 720 ledgers/hour, 17,280 ledgers/day.
const deadline = deadlineFromLatest(
  latestLedger,
  overrides.deadlineHours * 720,
);

const kp = keypairFromSecret(
  await ask(
    {
      type: "invisible",
      name: "ADMIN_SECRET",
      message: "Admin signer secret (S... strkey, or 24-word BIP-39 phrase)",
    },
    process.env.ADMIN_SECRET,
  ),
);
const signerAddr = kp.publicKey();

// Sign a SEP57 mint permit (action=1) over the predicted token address,
// with the factory as the recipient and raise_amount as the amount.
// The factory will relay this signature to the new token's `mint` call.
const message = buildPermitMessage({
  contractAddress: token,
  action: 1,
  accountAddress: factory,
  amount: raiseAmount,
  nonce,
  deadline,
});
const sig = kp.sign(message);
const mintSignature = new Uint8Array(sig);

const out = {
  networkPassphrase: getNetworkPassphrase(),
  factory,
  shipper,
  token_id: tokenId,
  raise_amount: raiseAmount.toString(),
  interest_bps: interestBps.toString(),
  due_ledger: dueLedger,
  latest_ledger: latestLedger,
  name,
  symbol,
  salt: toHex(salt),
  token,
  nonce: nonce.toString(),
  deadline,
  mint_signature: toHex(mintSignature),
  signer: signerAddr,
};

console.log(JSON.stringify(out, null, 2));
