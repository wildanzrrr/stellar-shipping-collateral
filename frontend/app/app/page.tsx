"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { webauthn } from "@/lib/dfns"
import { walletApi, ROLE_LABELS, type UserRole } from "@/lib/api"

type WalletInfo = { id: string; address: string; network: string }

// Role-specific dashboard intro. This is where the two experiences diverge —
// extend each branch as the Investor / Shipping Company surfaces are built out.
function RolePanel({ role }: { role?: UserRole }) {
  if (role === "SHIPPING_COMPANY") {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Shipping Company workspace</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tokenize maritime receivables and open financing offerings against
          them. Investor funding settles to your delegated Stellar wallet.
        </p>
      </div>
    )
  }
  if (role === "INVESTOR") {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Investor workspace</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Browse open receivable offerings and fund them. Positions and
          repayments settle to your delegated Stellar wallet.
        </p>
      </div>
    )
  }
  return null
}

export default function AppDashboard() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState("")
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [message, setMessage] = useState("Hello from Stellar via DFNS!")
  const [signature, setSignature] = useState("")

  // Defense-in-depth: middleware already gates this route.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/app/auth")
  }, [status, router])

  if (status !== "authenticated" || !session?.user?.email) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const email = session.user.email
  const role = session.user.role
  const accessToken = session.accessToken as string

  async function handleCreateWallet() {
    setBusy(true)
    setStatusMsg("")
    try {
      setStatusMsg("Creating Stellar Testnet wallet…")
      const w: WalletInfo = await walletApi.createWallet(accessToken, email)
      setStatusMsg("Delegating wallet to you…")
      await walletApi.delegateWallet(accessToken, email, w.id)
      setWallet(w)
      setStatusMsg("")
      toast.success("Wallet created and delegated")
    } catch (e: any) {
      setStatusMsg("")
      toast.error(e?.message ?? "Could not create wallet")
    } finally {
      setBusy(false)
    }
  }

  async function handleSignMessage() {
    if (!wallet) return
    setBusy(true)
    setStatusMsg("")
    setSignature("")
    try {
      setStatusMsg("Creating signing challenge…")
      const init: any = await walletApi.signInit(
        accessToken,
        email,
        wallet.id,
        message,
      )

      setStatusMsg("Sign the challenge with your passkey…")
      const firstFactor = await webauthn.sign(init)

      setStatusMsg("Submitting signed challenge…")
      const result: any = await walletApi.signComplete(accessToken, {
        username: email,
        walletId: wallet.id,
        challengeIdentifier: init.challengeIdentifier,
        firstFactor,
      })

      const sig = result?.signature ?? result?.signedTransaction ?? result
      setSignature(typeof sig === "string" ? sig : JSON.stringify(sig, null, 2))
      setStatusMsg("")
      toast.success("Message signed")
    } catch (e: any) {
      setStatusMsg("")
      toast.error(e?.message ?? "Could not sign message")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-medium">DFNS + Stellar Testnet</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </Button>
        </div>

        <p className="flex items-center gap-2 text-muted-foreground">
          Signed in as <code className="font-mono">{email}</code>
          {role && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
              {ROLE_LABELS[role]}
            </span>
          )}
        </p>

        <RolePanel role={role} />

        <div className="flex gap-2">
          <Button onClick={handleCreateWallet} disabled={busy}>
            {wallet ? "Wallet ready" : "Create wallet"}
          </Button>
        </div>

        {wallet && (
          <div className="rounded border p-3 font-mono text-xs">
            <div>id: {wallet.id}</div>
            <div>network: {wallet.network}</div>
            <div>address: {wallet.address}</div>
          </div>
        )}

        {wallet && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="message">
              Message to sign
            </label>
            <input
              id="message"
              className="rounded border bg-background px-2 py-1 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button onClick={handleSignMessage} disabled={busy}>
              Sign message
            </Button>
          </div>
        )}

        {signature && (
          <pre className="max-w-xl overflow-x-auto rounded border bg-muted/30 p-3 text-xs">
            {signature}
          </pre>
        )}

        {statusMsg && (
          <div className="text-xs text-muted-foreground">→ {statusMsg}</div>
        )}
      </div>
    </div>
  )
}
