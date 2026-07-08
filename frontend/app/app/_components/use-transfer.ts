"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { walletApi } from "@/lib/api"
import type { TransferValues } from "./transfer-schema"

export interface UseTransferArgs {
  accessToken: string
  email: string
  walletId: string | null
}

export interface UseTransferResult {
  transfer: (values: TransferValues) => void
  isPending: boolean
  statusMsg: string
  txHash: string | null
}

/**
 * DFNS passkey transfer flow for Stellar payments:
 * transfer/init → WebAuthn sign → transfer/complete (broadcast).
 */
export function useTransfer({
  accessToken,
  email,
  walletId,
}: UseTransferArgs): UseTransferResult {
  const [statusMsg, setStatusMsg] = useState("")
  const [txHash, setTxHash] = useState<string | null>(null)

  async function transferFlow(values: TransferValues) {
    if (!walletId) throw new Error("Your wallet is still being set up")

    const amount =
      typeof values.amount === "string" ? Number(values.amount) : values.amount

    setStatusMsg("Creating transfer challenge…")
    const init = await walletApi.transferInit(accessToken, {
      username: email,
      walletId,
      asset: values.asset,
      destination: values.destination,
      amount,
    })

    setStatusMsg("Confirm the transfer with your passkey…")
    const firstFactor = await webauthn.sign(
      init as unknown as Parameters<typeof webauthn.sign>[0]
    )

    setStatusMsg("Broadcasting to Stellar…")
    const result = await walletApi.transferComplete(accessToken, {
      username: email,
      walletId,
      challengeIdentifier: init.challengeIdentifier,
      firstFactor,
    })

    const hash =
      (result as Record<string, unknown>)?.txHash ??
      (result as Record<string, unknown>)?.broadcast ??
      null
    setTxHash(
      typeof hash === "string" ? hash : hash ? JSON.stringify(hash) : null
    )
    setStatusMsg("")
    toast.success("Transfer broadcast successfully")
  }

  const mutation = useMutation({
    mutationFn: transferFlow,
    onSuccess: () => {
      // state set inside flow
    },
    onError: (err) => {
      setStatusMsg("")
      toast.error(err instanceof Error ? err.message : "Transfer failed")
    },
  })

  return {
    transfer: (values: TransferValues) => mutation.mutate(values),
    isPending: mutation.isPending,
    statusMsg,
    txHash,
  }
}
