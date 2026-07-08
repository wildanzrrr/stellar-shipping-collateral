"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { walletApi } from "@/lib/api"

export interface UseSignMessageArgs {
  accessToken: string
  email: string
  walletId: string | null
}

export interface UseSignMessageResult {
  message: string
  setMessage: (v: string) => void
  signature: string
  statusMsg: string
  sign: () => void
  isPending: boolean
}

/**
 * Owns the DFNS passkey sign-message flow (challenge init → WebAuthn sign →
 * complete) plus the local UI state (message, signature, status line).
 * Visual components consume the returned fields and stay pure.
 */
export function useSignMessage({
  accessToken,
  email,
  walletId,
}: UseSignMessageArgs): UseSignMessageResult {
  const [message, setMessage] = useState("Hello from Stellar via DFNS!")
  const [signature, setSignature] = useState("")
  const [statusMsg, setStatusMsg] = useState("")

  async function signFlow(msg: string) {
    if (!walletId) throw new Error("Your wallet is still being set up")

    setStatusMsg("Creating signing challenge…")
    const init = await walletApi.signInit(accessToken, email, walletId, msg)

    setStatusMsg("Sign the challenge with your passkey…")
    const firstFactor = await webauthn.sign(
      init as unknown as Parameters<typeof webauthn.sign>[0]
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

  const mutation = useMutation({
    mutationFn: signFlow,
    onError: (err) => {
      setStatusMsg("")
      toast.error(err instanceof Error ? err.message : "Could not sign message")
    },
  })

  return {
    message,
    setMessage,
    signature,
    statusMsg,
    sign: () => mutation.mutate(message),
    isPending: mutation.isPending,
  }
}
