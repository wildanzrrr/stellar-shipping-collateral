/**
 * Build a signed burn permit for the SEP57 token.
 *
 * TTY-only. ADMIN_SECRET may be provided via env (kept for CI/scripting).
 * All other inputs are prompted interactively.
 *
 *   npm run sign:burn
 *
 * Output (JSON): { contract, from, amount, nonce, deadline, signature }
 */
import prompts from "prompts";
import {
  ask,
  buildPermitMessage,
  getNetworkPassphrase,
  keypairFromSecret,
  nextDeadline,
  nextNonce,
  toHex,
  isValidGAddress,
  isValidCAddress,
} from "./lib.js";

const onCancel = () => process.exit(1);

const contract = await ask({
  type: "text",
  name: "TOKEN_CONTRACT_ADDRESS",
  message: "Token contract address (C...)",
  validate: (v: string) =>
    isValidCAddress(v.trim()) ? true : "Not a valid C... contract address",
});

const from = await ask({
  type: "text",
  name: "FROM_ADDRESS",
  message: "Holder to burn from (G...)",
  validate: (v: string) =>
    isValidGAddress(v.trim()) ? true : "Not a valid G... address",
});

const amountStr = await ask({
  type: "text",
  name: "AMOUNT",
  message: "Amount (integer, base units)",
  validate: (v: string) => {
    try {
      const n = BigInt(v.trim());
      return n > 0n ? true : "Must be > 0";
    } catch {
      return "Must be an integer";
    }
  },
});
const amount = BigInt(amountStr);

const overrides = await prompts(
  [
    {
      type: "number",
      name: "nonce",
      message: "Nonce (blank for auto)",
    },
    {
      type: "number",
      name: "ledgersAhead",
      message: "Deadline in ledgers ahead (default 720 ≈ 1h)",
      initial: 720,
    },
  ],
  { onCancel },
);
const nonce = nextNonce();
const ledgers =
  overrides.ledgersAhead !== undefined && overrides.ledgersAhead !== null
    ? overrides.ledgersAhead
    : 720;
const deadline = nextDeadline(ledgers);

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

const message = buildPermitMessage({
  contractAddress: contract,
  action: 2,
  accountAddress: from,
  amount,
  nonce,
  deadline,
});

const sig = kp.sign(message);
const signature = new Uint8Array(sig);

const out = {
  networkPassphrase: getNetworkPassphrase(),
  contract,
  action: "burn",
  from,
  amount: amount.toString(),
  nonce: nonce.toString(),
  deadline,
  signature: toHex(signature),
  signer: signerAddr,
};

console.log(JSON.stringify(out, null, 2));
