"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { rwaApi, collateralApi, walletApi, type PreparedTx } from "@/lib/api"

import type { IssueCollateralValues } from "./issue-collateral-schema"

export type IssueStep =
  | "idle"
  | "preparing"
  | "awaiting-passkey"
  | "submitting"
  | "creating-collateral"
  | "done"

export interface UseIssueCollateralArgs {
  accessToken: string
  email: string
  walletId: string | null
}

export interface UseIssueCollateralResult {
  issue: (values: IssueCollateralValues) => Promise<{
    collateralId: string
    rwaId: string
    txHash: string
  } | null>
  isPending: boolean
  step: IssueStep
  statusMsg: string
  preparedTx: PreparedTx | null
  txHash: string | null
  collateralId: string | null
  reset: () => void
}

/**
 * Full issue-collateral flow:
 * 1. Prepare create_rwa_token → get unsigned XDR + predicted token address
 * 2. DFNS sign init → WebAuthn → sign complete (gets signedTxXdr)
 * 3. Submit signed tx to Soroban RPC
 * 4. Create local collateral record linked to the on-chain RWA
 */
export function useIssueCollateral({
  accessToken,
  email,
  walletId,
}: UseIssueCollateralArgs): UseIssueCollateralResult {
  const [step, setStep] = useState<IssueStep>("idle")
  const [statusMsg, setStatusMsg] = useState("")
  const [preparedTx, setPreparedTx] = useState<PreparedTx | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [collateralId, setCollateralId] = useState<string | null>(null)

  async function issueFlow(values: IssueCollateralValues) {
    if (!walletId) throw new Error("Your wallet is still being set up")

    // 1. Prepare create_rwa_token
    setStep("preparing")
    setStatusMsg("Preparing create_rwa_token transaction…")
    const prepared = await rwaApi.prepareCreateRwaToken(accessToken, {
      tokenId: values.tokenId,
      raiseAmount: values.raiseAmount,
      interestBps: values.interestBps,
      dueDays: Number(values.dueDays),
      name: values.name,
      symbol: values.symbol,
    })
    setPreparedTx(prepared)

    // 2. DFNS sign the transaction XDR
    setStep("awaiting-passkey")
    setStatusMsg("Sign the transaction with your passkey…")

    // sign init — the BE wraps the XDR as the "message"
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

    // 3. Submit signed transaction to Soroban
    setStep("submitting")
    setStatusMsg("Submitting transaction to Stellar…")
    const submitResult = await rwaApi.submitTransaction(
      accessToken,
      signedTxXdr as string
    )

    if (submitResult.status !== "SUCCESS") {
      throw new Error(
        `Transaction failed: ${submitResult.errorResult ?? submitResult.status}`
      )
    }
    setTxHash(submitResult.hash)

    // 4. Create local collateral record
    setStep("creating-collateral")
    setStatusMsg("Creating collateral record…")
    const rwaId = values.tokenId // The token_id serves as the RWA identifier
    const collateral = await collateralApi.create(accessToken, {
      rwaId,
      tokenAddress: prepared.predictedTokenAddress ?? undefined,
      collateralData: {
        name: values.name,
        symbol: values.symbol,
        raiseAmount: values.raiseAmount,
        interestBps: values.interestBps,
        dueDays: Number(values.dueDays),
        description: values.description ?? "",
        txHash: submitResult.hash,
      },
    })
    setCollateralId(collateral.id)

    setStep("done")
    setStatusMsg("")
    toast.success("Collateral issued successfully!")

    return {
      collateralId: collateral.id,
      rwaId,
      txHash: submitResult.hash,
    }
  }

  const mutation = useMutation({
    mutationFn: issueFlow,
    onError: (err) => {
      setStatusMsg("")
      setStep("idle")
      toast.error(
        err instanceof Error ? err.message : "Failed to issue collateral"
      )
    },
  })

  function reset() {
    setStep("idle")
    setStatusMsg("")
    setPreparedTx(null)
    setTxHash(null)
    setCollateralId(null)
  }

  return {
    issue: (v: IssueCollateralValues) => mutation.mutateAsync(v),
    isPending: mutation.isPending,
    step,
    statusMsg,
    preparedTx,
    txHash,
    collateralId,
    reset,
  }
}
