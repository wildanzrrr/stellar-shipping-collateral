/**
 * Decode a Stellar G... strkey address to its raw 32-byte ed25519 pubkey (hex).
 *
 * Interactive: prompts for the address. Falls back to ADMIN_SIGNER_ADDRESS
 * env var if set, or stdin non-TTY.
 *
 *   npm run decode
 *   # or
 *   npm run decode -- GAQG4QHJTX4NHPEKSU6UE4NABDUV673HL6QCRSAJRYFWTAAPVKJU2QIH
 */
import { ask, isValidGAddress, StrKey } from "./lib.js";

const arg =
  process.argv[2] ||
  (await ask(
    {
      type: "text",
      name: "G_ADDRESS",
      message: "Stellar address to decode (G...)",
      validate: (v: string) =>
        isValidGAddress(v.trim()) ? true : "Not a valid G... address",
    },
    process.env.ADMIN_SIGNER_ADDRESS,
  ));

try {
  const raw = StrKey.decodeEd25519PublicKey(arg.trim());
  const hex = Buffer.from(raw).toString("hex");
  console.log(`address : ${arg}`);
  console.log(`pubkey  : ${hex}`);
  console.log(`bytes   : ${raw.length}`);
  const reencoded = StrKey.encodeEd25519PublicKey(raw);
  if (reencoded !== arg) {
    console.warn(`⚠  re-encode mismatch (${reencoded})`);
  }
} catch (e) {
  console.error("decode failed:", (e as Error).message);
  process.exit(1);
}
