"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { webauthn } from "@/lib/dfns"
import { authApi, ROLE_LABELS, type UserRole } from "@/lib/api"

type Mode = "login" | "register"

const ROLES: UserRole[] = ["INVESTOR", "SHIPPING_COMPANY"]

function AuthInner() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") || "/app"

  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<UserRole>("INVESTOR")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [status, setStatus] = useState("")

  // DFNS login ceremony -> BE issues JWTs -> establish NextAuth session.
  async function completeLogin(userEmail: string) {
    setStatus("Requesting login challenge…")
    const init = await authApi.loginInit(userEmail)

    setStatus("Sign in with your passkey…")
    const firstFactor = await webauthn.sign(
      init as unknown as Parameters<typeof webauthn.sign>[0],
    )

    setStatus("Verifying…")
    const result = await authApi.loginComplete({
      email: userEmail,
      challengeIdentifier: init.challengeIdentifier,
      firstFactor,
    })

    setStatus("Starting your session…")
    const res = await signIn("dfns", {
      email: result.user.email,
      userId: result.user.id,
      role: result.user.role,
      firstName: result.user.firstName ?? "",
      lastName: result.user.lastName ?? "",
      walletId: result.user.walletId ?? "",
      walletAddress: result.user.walletAddress ?? "",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: String(result.expiresIn),
      redirect: false,
    })

    if (res?.error) throw new Error("Could not start session")
    toast.success("Signed in")
    router.push(callbackUrl)
    router.refresh()
  }

  // Register: create the DFNS user + passkey, provision the wallet on the BE,
  // then complete the passkey login to mint tokens.
  async function registerFlow(userEmail: string) {
    setStatus("Checking your account…")
    const regInit = await authApi.registerInit({
      email: userEmail,
      role,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    })

    if ("alreadyRegistered" in regInit) {
      setStatus("Account exists — signing you in…")
      await completeLogin(userEmail)
      return
    }

    setStatus("Create a passkey (Touch ID / security key)…")
    const attestation = await webauthn.create(
      regInit as unknown as Parameters<typeof webauthn.create>[0],
    )

    setStatus("Finishing registration…")
    await authApi.registerComplete({
      email: userEmail,
      temporaryAuthenticationToken: regInit.temporaryAuthenticationToken,
      firstFactorCredential: attestation,
    })

    await completeLogin(userEmail)
  }

  const loginMutation = useMutation({
    mutationFn: completeLogin,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Login failed")
      setStatus("")
    },
  })

  const registerMutation = useMutation({
    mutationFn: registerFlow,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Registration failed")
      setStatus("")
    },
  })

  const busy = loginMutation.isPending || registerMutation.isPending

  function handleLogin() {
    const e = email.trim()
    if (e) loginMutation.mutate(e)
  }

  function handleRegister() {
    const e = email.trim()
    if (e) registerMutation.mutate(e)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-medium">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Use your email and passkey."
              : "Email + a passkey. No password."}
          </p>
        </div>

        <div className="flex rounded-lg border p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("login")
              setStatus("")
            }}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === "login" ? "bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register")
              setStatus("")
            }}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === "register"
                ? "bg-muted font-medium"
                : "text-muted-foreground"
            }`}
          >
            Create account
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (mode === "login") handleLogin()
            else handleRegister()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
            />
          </div>

          {mode === "register" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">I am a…</span>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      role === r
                        ? "border-foreground bg-muted font-medium"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="firstName"
                >
                  First name
                </label>
                <input
                  id="firstName"
                  autoComplete="given-name"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Alice"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="lastName"
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  autoComplete="family-name"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={busy || !email.trim()}>
            {busy
              ? "Working…"
              : mode === "login"
                ? "Sign in with passkey"
                : "Create account"}
          </Button>
        </form>

        {status && (
          <div className="text-center text-xs text-muted-foreground">
            → {status}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  )
}
