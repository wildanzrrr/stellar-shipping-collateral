"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { webauthn } from "@/lib/dfns"
import { api } from "@/lib/api"

type WalletInfo = { id: string; address: string; network: string }

export default function Page() {
  const [username, setUsername] = useState("demo-user-1")
  const [submittedUsername, setSubmittedUsername] = useState<string | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>("")
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [message, setMessage] = useState("Hello from Stellar via DFNS!")
  const [signature, setSignature] = useState<string>("")

  const activeUsername = submittedUsername ?? username

  async function ensureRegisteredAndLoggedIn(u: string) {
    setStatus("Requesting registration challenge…")
    const regInit: any = await api.registerInit(u)

    if (regInit.alreadyRegistered) {
      setStatus("User already registered, logging in…")
    } else {
      setStatus("Create a passkey (Touch ID / security key)…")
      const attestation = await webauthn.create(regInit)
      setStatus("Completing registration…")
      await api.registerComplete({
        username: u,
        temporaryAuthenticationToken: regInit.temporaryAuthenticationToken,
        firstFactorCredential: attestation,
      })
    }

    setStatus("Requesting login challenge…")
    const loginInit: any = await api.loginInit(u)
    setStatus("Sign in with your passkey…")
    const firstFactor = await webauthn.sign(loginInit)
    setStatus("Completing login…")
    await api.loginComplete({
      username: u,
      temporaryAuthenticationToken: loginInit.temporaryAuthenticationToken,
      challengeIdentifier: loginInit.challengeIdentifier,
      firstFactor,
    })
    setStatus("Logged in.")
  }

  async function handleStart() {
    const u = username.trim()
    if (!u) return
    setSubmittedUsername(u)
  }

  async function handleCreateWallet() {
    if (!submittedUsername) return
    setBusy(true)
    setStatus("")
    try {
      await ensureRegisteredAndLoggedIn(submittedUsername)
      setStatus("Creating Stellar Testnet wallet…")
      const w: WalletInfo = await api.createWallet(submittedUsername)
      setStatus("Delegating wallet to you…")
      await api.delegateWallet(submittedUsername, w.id)
      setWallet(w)
      setStatus("Wallet created and delegated.")
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleSignMessage() {
    if (!wallet || !submittedUsername) return
    setBusy(true)
    setStatus("")
    setSignature("")
    try {
      setStatus("Creating signing challenge…")
      const init: any = await api.signInit(
        submittedUsername,
        wallet.id,
        message
      )

      setStatus("Sign the challenge with your passkey…")
      const firstFactor = await webauthn.sign(init)

      setStatus("Submitting signed challenge…")
      const result: any = await api.signComplete({
        username: submittedUsername,
        walletId: wallet.id,
        challengeIdentifier: init.challengeIdentifier,
        firstFactor,
      })

      const sig = result?.signature ?? JSON.stringify(result)
      setSignature(typeof sig === "string" ? sig : JSON.stringify(sig, null, 2))
      setStatus("Signed.")
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <h1 className="text-lg font-medium">DFNS + Stellar Testnet</h1>

        {!submittedUsername ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleStart()
            }}
          >
            <label className="text-xs text-muted-foreground" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="rounded border bg-background px-2 py-1 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. demo-user-1"
              autoFocus
            />
            <Button type="submit" disabled={!username.trim()}>
              Continue
            </Button>
          </form>
        ) : (
          <>
            <p className="text-muted-foreground">
              Logged in as <code className="font-mono">{activeUsername}</code>
            </p>

            <div className="flex gap-2">
              <Button onClick={handleCreateWallet} disabled={busy}>
                {wallet ? "Wallet ready" : "Create wallet"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmittedUsername(null)
                  setWallet(null)
                  setSignature("")
                  setStatus("")
                }}
                disabled={busy}
              >
                Change user
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
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="message"
                >
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
          </>
        )}

        {status && (
          <div className="text-xs text-muted-foreground">→ {status}</div>
        )}
      </div>
    </div>
  )
}
