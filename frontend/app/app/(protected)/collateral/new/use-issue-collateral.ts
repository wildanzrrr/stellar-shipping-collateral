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
  | "approving"
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
 * 1. Approve the factory as a USDC spender (upfront interest + protocol fee)
 *    — DFNS sign → submit. Required before create_rwa_token can transfer_from.
 * 2. Prepare create_rwa_token → get unsigned XDR + predicted token address
 * 3. DFNS sign init → WebAuthn → sign complete (gets signedTxXdr)
 * 4. Submit signed tx to Soroban RPC
 * 5. Create local collateral record linked to the on-chain RWA
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
    const wid = walletId

    // Sign an XDR via DFNS (passkey) and submit it to Soroban, waiting for the
    // on-chain result. Returns the submit result on SUCCESS, throws otherwise.
    async function signAndSubmit(xdrToSign: string) {
      // sign init — the BE wraps the XDR as the "message"
      const signInit = await walletApi.signInit(
        accessToken,
        email,
        wid,
        xdrToSign
      )

      const firstFactor = await webauthn.sign(
        signInit as unknown as Parameters<typeof webauthn.sign>[0]
      )

      setStatusMsg("Completing signature…")
      const signResult = await walletApi.signComplete(accessToken, {
        username: email,
        walletId: wid,
        challengeIdentifier: signInit.challengeIdentifier,
        firstFactor,
      })

      const signedTxXdr =
        signResult.signedTransaction ??
        (typeof signResult.signature === "string" ? signResult.signature : null)

      if (!signedTxXdr || typeof signedTxXdr !== "string") {
        throw new Error("DFNS did not return a signed transaction")
      }

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
      return submitResult
    }

    const createTokenPayload = {
      raiseAmount: values.raiseAmount,
      interestBps: values.interestBps,
      dueDays: Number(values.dueDays),
      name: values.name,
      symbol: values.symbol,
    }

    // 1. Approve the factory as a USDC spender for the upfront fee, then sign
    //    + submit it. create_rwa_token's transfer_from needs this allowance.
    setStep("approving")
    setStatusMsg("Preparing USDC approval…")
    const approvePrepared = await rwaApi.prepareApproveFactory(
      accessToken,
      createTokenPayload
    )

    setStep("awaiting-passkey")
    setStatusMsg("Approve the USDC allowance with your passkey…")
    await signAndSubmit(approvePrepared.txXdr)

    // 2. Prepare create_rwa_token (now that the allowance is on-chain)
    setStep("preparing")
    setStatusMsg("Preparing create_rwa_token transaction…")
    const prepared = await rwaApi.prepareCreateRwaToken(
      accessToken,
      createTokenPayload
    )
    setPreparedTx(prepared)

    // 3 + 4. DFNS sign the create_rwa_token XDR and submit it to Soroban
    setStep("awaiting-passkey")
    setStatusMsg("Sign the transaction with your passkey…")
    const submitResult = await signAndSubmit(prepared.txXdr)
    setTxHash(submitResult.hash)

    // 5. Create local collateral record
    setStep("creating-collateral")
    setStatusMsg("Creating collateral record…")
    // Backend auto-generates tokenId; use it as the RWA identifier
    const rwaId = prepared.tokenId
    if (!rwaId) throw new Error("Backend did not return a token ID")
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
