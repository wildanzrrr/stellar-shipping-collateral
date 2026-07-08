// Browser-side DFNS signer (WebAuthn / passkey).
// Used both during registration and to sign user-action challenges.
import { WebAuthnSigner } from "@dfns/sdk-browser"

const orgId = process.env.NEXT_PUBLIC_DFNS_ORG_ID!
const baseUrl = process.env.NEXT_PUBLIC_DFNS_API_URL!
const rpId = process.env.NEXT_PUBLIC_DFNS_RP_ID!

export const dfnsConfig = { orgId, baseUrl, rpId }
export const webauthn = new WebAuthnSigner({
  relyingParty: { id: rpId, name: "DFNS Stellar Demo" },
})
