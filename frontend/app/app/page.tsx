"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { webauthn } from "@/lib/dfns"
import { authApi, walletApi, ROLE_LABELS, type UserRole } from "@/lib/api"

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

  const [message, setMessage] = useState("Hello from Stellar via DFNS!")
  const [signature, setSignature] = useState("")
  const [statusMsg, setStatusMsg] = useState("")

  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""

  // Defense-in-depth: middleware already gates this route.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/app/auth")
  }, [status, router])

  // Authoritative user + wallet (created & friendbot-funded at registration).
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: status === "authenticated" && Boolean(accessToken),
  })

  const walletId = meQuery.data?.walletId ?? session?.user?.walletId ?? null
  const walletAddress =
    meQuery.data?.walletAddress ?? session?.user?.walletAddress ?? null
  const role = meQuery.data?.role ?? session?.user?.role

  async function signFlow(msg: string) {
    if (!walletId) throw new Error("Your wallet is still being set up")

    setStatusMsg("Creating signing challenge…")
    const init = await walletApi.signInit(accessToken, email, walletId, msg)

    setStatusMsg("Sign the challenge with your passkey…")
    const firstFactor = await webauthn.sign(
      init as unknown as Parameters<typeof webauthn.sign>[0],
    )

    setStatusMsg("Submitting signed challenge…")
    const result = await walletApi.signComplete(accessToken, {
      username: email,
      walletId,
      challengeIdentifier: init.challengeIdentifier,
      firstFactor,
    })

    const sig = result.signature ?? result.signedTransaction ?? result
    setSignature(typeof sig === "string" ? sig : JSON.stringify(sig, null, 2))
    setStatusMsg("")
    toast.success("Message signed")
  }

  const signMutation = useMutation({
    mutationFn: signFlow,
    onError: (err) => {
      setStatusMsg("")
      toast.error(err instanceof Error ? err.message : "Could not sign message")
    },
  })

  if (status !== "authenticated" || !email) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
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

        <div className="rounded border p-3 font-mono text-xs">
          <div className="mb-1 font-sans font-medium">Your Stellar wallet</div>
          {meQuery.isLoading && !walletId ? (
            <div>Loading…</div>
          ) : walletId ? (
            <>
              <div>id: {walletId}</div>
              <div>address: {walletAddress}</div>
            </>
          ) : (
            <div className="font-sans text-muted-foreground">
              Wallet is still being provisioned — refresh in a moment.
            </div>
          )}
        </div>

        {walletId && (
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
            <Button
              onClick={() => signMutation.mutate(message)}
              disabled={signMutation.isPending}
            >
              {signMutation.isPending ? "Signing…" : "Sign message"}
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
