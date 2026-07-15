"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { rwaApi, walletApi } from "@/lib/api"

interface UseTxActionArgs {
  accessToken: string
  email: string
  walletId: string | null
}

interface UseTxActionResult {
  execute: (
    prepareFn: () => Promise<{ txXdr: string }>,
    actionLabel: string
  ) => Promise<string | null>
  isPending: boolean
  statusMsg: string
}

/**
 * Generic DFNS sign + submit flow for Soroban transactions.
 * Used by collect_fund and settle_debt actions.
 */
export function useTxAction({
  accessToken,
  email,
  walletId,
}: UseTxActionArgs): UseTxActionResult {
  const [statusMsg, setStatusMsg] = useState("")

  async function flow(
    prepareFn: () => Promise<{ txXdr: string }>,
    actionLabel: string
  ): Promise<string | null> {
    if (!walletId) throw new Error("Your wallet is still being set up")

    setStatusMsg(`Preparing ${actionLabel}…`)
    const prepared = await prepareFn()

    setStatusMsg("Sign the transaction with your passkey…")
    const signInit = await walletApi.signInit(
      accessToken,
      email,
      walletId,
      prepared.txXdr
    )

    const firstFactor = await webauthn.sign(
      signInit as unknown as Parameters<typeof webauthn.sign>[0]
    )

    setStatusMsg("Completing signature…")
    const signResult = await walletApi.signComplete(accessToken, {
      username: email,
      walletId,
      challengeIdentifier: signInit.challengeIdentifier,
      firstFactor,
    })

    const signedTxXdr =
      signResult.signedTransaction ??
      (typeof signResult.signature === "string" ? signResult.signature : null)

    if (!signedTxXdr || typeof signedTxXdr !== "string") {
      throw new Error("DFNS did not return a signed transaction")
    }

    setStatusMsg("Submitting to Stellar…")
    const result = await rwaApi.submitTransaction(accessToken, signedTxXdr)

    if (result.status !== "SUCCESS") {
      throw new Error(
        `Transaction failed: ${result.errorResult ?? result.status}`
      )
    }

    setStatusMsg("")
    toast.success(`${actionLabel} submitted successfully!`)
    return result.hash
  }

  const mutation = useMutation({
    mutationFn: ({
      prepareFn,
      actionLabel,
    }: {
      prepareFn: () => Promise<{ txXdr: string }>
      actionLabel: string
    }) => flow(prepareFn, actionLabel),
    onError: (err) => {
      setStatusMsg("")
      toast.error(err instanceof Error ? err.message : "Transaction failed")
    },
  })

  return {
    execute: (prepareFn, actionLabel) =>
      mutation.mutateAsync({ prepareFn, actionLabel }),
    isPending: mutation.isPending,
    statusMsg,
  }
}
