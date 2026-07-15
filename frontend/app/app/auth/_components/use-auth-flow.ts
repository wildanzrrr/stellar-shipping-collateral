"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { authApi, type UserRole } from "@/lib/api"

interface RegisterInput {
  email: string
  role: UserRole
  firstName?: string
  lastName?: string
}

/**
 * Owns the DFNS passkey ceremonies + the resulting NextAuth session handshake.
 * Exposes imperative `login`/`register` triggers and a human-readable `status`.
 */
export function useAuthFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") || "/app"
  const [status, setStatus] = useState("")

  // DFNS login ceremony -> BE issues JWTs -> establish NextAuth session.
  async function completeLogin(email: string) {
    setStatus("Requesting login challenge — please wait")
    const init = await authApi.loginInit(email)

    setStatus("Sign in with your passkey — please wait")
    const firstFactor = await webauthn.sign(
      init as unknown as Parameters<typeof webauthn.sign>[0]
    )

    setStatus("Verifying your passkey — do not close this page")
    const result = await authApi.loginComplete({
      email,
      challengeIdentifier: init.challengeIdentifier,
      firstFactor,
    })

    setStatus("Starting your session — do not close or refresh this page")
    const res = await signIn("dfns", {
      email: result.user.email,
      userId: result.user.id,
      role: result.user.role,
      kycStatus: result.user.kycStatus,
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
  async function registerFlow(input: RegisterInput) {
    setStatus("Checking your account — please wait")
    const regInit = await authApi.registerInit({
      email: input.email,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
    })

    setStatus("Create a passkey (Touch ID / security key) — please wait")
    const attestation = await webauthn.create(
      regInit as unknown as Parameters<typeof webauthn.create>[0]
    )

    setStatus("Finishing registration — do not close this page")
    await authApi.registerComplete({
      email: input.email,
      temporaryAuthenticationToken: regInit.temporaryAuthenticationToken,
      firstFactorCredential: attestation,
    })

    await completeLogin(input.email)
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

  return {
    status,
    resetStatus: () => setStatus(""),
    busy: loginMutation.isPending || registerMutation.isPending,
    login: (email: string) => loginMutation.mutate(email),
    register: (input: RegisterInput) => registerMutation.mutate(input),
  }
}
