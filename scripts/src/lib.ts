import "dotenv/config";
import prompts from "prompts";
import { Keypair, StrKey, Networks, hash } from "@stellar/stellar-sdk";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

export function getAdminKeypair(): Keypair {
  const secret = requireEnv("ADMIN_SECRET");
  return keypairFromSecret(secret);
}

/**
 * Accept either:
 *   - S...  Stellar strkey secret seed (raw ed25519 seed, 32 bytes)
 *   - bip39 24-word mnemonic (Stellar CLI format) → derived at m/44'/148'/0'
 */
export function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim();
  if (StrKey.isValidEd25519SecretSeed(s)) {
    return Keypair.fromSecret(s);
  }
  if (bip39.validateMnemonic(s)) {
    const seed = bip39.mnemonicToSeedSync(s, "");
    const { key } = derivePath("m/44'/148'/0'", seed.toString("hex"));
    // Stellar wraps the ed25519 seed with SHA-256 to get the actual secret seed
    // (matches SEP-0005 / stellar SDK `Keypair.fromRawEd25519Seed`).
    const wrapped = hash(key);
    return Keypair.fromRawEd25519Seed(wrapped);
  }
  throw new Error(
    "ADMIN_SECRET must be an S... strkey or a 24-word BIP-39 mnemonic",
  );
}

export function getAdminSignerAddress(): string {
  return requireEnv("ADMIN_SIGNER_ADDRESS");
}

export function getTokenContractAddress(): string {
  return requireEnv("TOKEN_CONTRACT_ADDRESS");
}

export function getNetworkPassphrase(): string {
  return process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
}

/** Generate a fresh nonce. Caller may override via env NONCE. */
export function nextNonce(): bigint {
  if (process.env.NONCE) {
    return BigInt(process.env.NONCE);
  }
  // Random 64-bit value (full u64 range). Mask off sign bit so it's a true u64.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n & 0xffffffffffffffffn;
}

/** Deadline in ledgers. Defaults to 1 hour (~720 ledgers) from now. */
export function nextDeadline(ledgersAhead = 720): number {
  return Math.floor(Date.now() / 1000) + ledgersAhead * 5;
}

/**
 * Build the SEP57 permit message bytes.
 * Mirrors the on-chain format in `lib.rs::permit_message`:
 *
 *   b"SEP57_PERMIT_V1"
 *   || action: u8
 *   || contract: len(u32 BE) || strkey_string_bytes
 *   || account:  len(u32 BE) || strkey_string_bytes
 *   || amount:   i128 BE (16 bytes)
 *   || nonce:    u64 BE  (8 bytes)
 *   || deadline: u32 BE  (4 bytes)
 */
export function buildPermitMessage(opts: {
  contractAddress: string;
  action: 1 | 2; // 1 = mint, 2 = burn
  accountAddress: string;
  amount: bigint;
  nonce: bigint;
  deadline: number;
}): Uint8Array {
  const { contractAddress, action, accountAddress, amount, nonce, deadline } =
    opts;

  const parts: Uint8Array[] = [];

  parts.push(new TextEncoder().encode("SEP57_PERMIT_V1"));
  parts.push(new Uint8Array([action]));

  parts.push(encodeLenPrefixedStr(contractAddress));
  parts.push(encodeLenPrefixedStr(accountAddress));

  parts.push(bigIntToBEBytes(amount, 16));
  parts.push(bigIntToBEBytes(nonce, 8));
  parts.push(uint32ToBEBytes(deadline));

  return concat(parts);
}

function encodeLenPrefixedStr(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, 4);
  return out;
}

function bigIntToBEBytes(n: bigint, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  let v = n;
  for (let i = byteLen - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function uint32ToBEBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

function concat(arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Prompt the user interactively for a value, but accept an env var as a
 * non-interactive fallback. The prompt is skipped entirely if the env var
 * is set OR stdin isn't a TTY (e.g. piped/CI).
 */
export async function ask(
  question: prompts.PromptObject,
  envFallback?: string,
): Promise<string> {
  const envName = question.name as string;
  const fromEnv = envFallback ?? process.env[envName];
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      `Missing ${envName}: set env var ${envName} or run in a terminal.`,
    );
  }
  const res = await prompts(question, { onCancel: () => process.exit(1) });
  const v = res[question.name as keyof typeof res];
  if (v === undefined || v === null || (typeof v === "string" && v === "")) {
    throw new Error(`No value provided for ${envName}`);
  }
  return String(v).trim();
}

export function isValidGAddress(s: string): boolean {
  return StrKey.isValidEd25519PublicKey(s);
}

export function isValidCAddress(s: string): boolean {
  return StrKey.isValidContract(s);
}

export { StrKey };
