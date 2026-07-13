"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { webauthn } from "@/lib/dfns"
import { rwaApi, collateralApi, walletApi, type PreparedTx } from "@/lib/api"

import type { IssueCollateralValues } from "./issue-collateral-schema"
import type {
  PendingDocuments,
  DocumentTypeKey,
} from "./issue-collateral-schema"

export type IssueStep =
  | "idle"
  | "creating-collateral"
  | "uploading-documents"
  | "approving"
  | "preparing"
  | "awaiting-passkey"
  | "submitting"
  | "finalizing"
  | "done"

export type DocUploadStatus = "uploading" | "done" | "error"

/** Per-document-slot upload progress, surfaced to the form for progress bars. */
export interface DocProgress {
  status: DocUploadStatus
  /** 0–100 */
  progress: number
}

export type DocProgressMap = Partial<Record<DocumentTypeKey, DocProgress>>

export interface UseIssueCollateralArgs {
  accessToken: string
  email: string
  walletId: string | null
}

export interface UseIssueCollateralResult {
  issue: (
    values: IssueCollateralValues,
    documents?: PendingDocuments
  ) => Promise<{
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
  docProgress: DocProgressMap
  reset: () => void
}

/**
 * Full issue-collateral flow (documents-first ordering):
 * 1. Create the local collateral record → returns its id + generated rwaId
 * 2. Upload the supporting documents to that record (per-box progress bars;
 *    non-blocking — upload failures don't stop the on-chain flow)
 * 3. Approve the factory as a USDC spender (upfront interest + protocol fee)
 *    — DFNS sign → submit. Required before create_rwa_token can transfer_from.
 * 4. Prepare create_rwa_token, reusing the record's rwaId as the token id
 * 5. DFNS sign → submit the signed tx to Soroban RPC
 * 6. Finalize: write the token address + tx hash back onto the record
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
  const [docProgress, setDocProgress] = useState<DocProgressMap>({})

  async function issueFlow(
    values: IssueCollateralValues,
    documents: PendingDocuments = {}
  ) {
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

    // Convert human-readable USDC to raw base units (USDC has 7 decimals)
    // e.g. "20" → 200_000_000, "2.5" → 25_000_000
    const raiseAmountRaw = BigInt(
      Math.round(Number(values.raiseAmount) * 10_000_000)
    ).toString()

    const createTokenPayload = {
      raiseAmount: raiseAmountRaw,
      interestBps: values.interestBps,
      dueDays: Number(values.dueDays),
      name: values.name,
      symbol: values.symbol,
    }

    // 1. Create the collateral record FIRST so we have an id to attach
    //    documents to, and an rwaId to reuse as the on-chain token id. The
    //    backend generates the rwaId when we omit it.
    setStep("creating-collateral")
    setStatusMsg("Creating collateral record…")
    const collateral = await collateralApi.create(accessToken, {
      collateralData: {
        name: values.name,
        symbol: values.symbol,
        raiseAmount: raiseAmountRaw,
        interestBps: values.interestBps,
        dueDays: Number(values.dueDays),
        description: values.description ?? "",
      },
    })
    setCollateralId(collateral.id)
    const rwaId = collateral.rwaId
    if (!rwaId) throw new Error("Backend did not return an RWA id")

    // 2. Upload the supporting documents to the new record (with per-box
    //    progress bars). Upload failures are non-blocking — the on-chain flow
    //    still proceeds and documents can be re-uploaded from the details page.
    const docEntries = Object.entries(documents).filter(
      (v): v is [DocumentTypeKey, File] => v[1] !== undefined
    )
    if (docEntries.length > 0) {
      setStep("uploading-documents")
      setStatusMsg(`Uploading ${docEntries.length} document(s)…`)
      // Seed every slot at 0% so each box shows a progress bar immediately.
      setDocProgress(
        Object.fromEntries(
          docEntries.map(([docType]) => [
            docType,
            { status: "uploading", progress: 0 },
          ])
        )
      )
      const uploadErrors: string[] = []
      // Upload in parallel so each document box animates its own progress bar.
      await Promise.all(
        docEntries.map(async ([docType, file]) => {
          try {
            await collateralApi.uploadDocument(
              accessToken,
              collateral.id,
              file,
              docType,
              (percent) =>
                setDocProgress((prev) => ({
                  ...prev,
                  [docType]: { status: "uploading", progress: percent },
                }))
            )
            setDocProgress((prev) => ({
              ...prev,
              [docType]: { status: "done", progress: 100 },
            }))
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Unknown upload error"
            uploadErrors.push(`${file.name}: ${msg}`)
            setDocProgress((prev) => ({
              ...prev,
              [docType]: { status: "error", progress: 0 },
            }))
          }
        })
      )
      if (uploadErrors.length > 0) {
        toast.warning(
          `${uploadErrors.length}/${docEntries.length} document(s) failed to upload`,
          { description: uploadErrors.join("; ") }
        )
      } else {
        toast.success(`${docEntries.length} document(s) uploaded`)
      }
    }

    // 3. Approve the factory as a USDC spender for the upfront fee, then sign
    //    + submit it. create_rwa_token's transfer_from needs this allowance.
    setStep("approving")
    setStatusMsg("Preparing USDC approval…")
    const approvePrepared = await rwaApi.prepareApproveFactory(
      accessToken,
      createTokenPayload
    )

    setStep("awaiting-passkey")
    setStatusMsg("Approve the USDC allowance with your passkey…")
    const approveResult = await signAndSubmit(approvePrepared.txXdr)

    toast.success("USDC allowance approved", {
      action: {
        label: "View on Stellar Expert ↗",
        onClick: () =>
          window.open(
            `https://stellar.expert/explorer/testnet/tx/${approveResult.hash}`,
            "_blank"
          ),
      },
    })

    // 4. Prepare create_rwa_token (now that the allowance is on-chain), reusing
    //    the collateral record's rwaId as the on-chain token id.
    setStep("preparing")
    setStatusMsg("Preparing create_rwa_token transaction…")
    const prepared = await rwaApi.prepareCreateRwaToken(accessToken, {
      ...createTokenPayload,
      tokenId: rwaId,
    })
    setPreparedTx(prepared)

    // 5. DFNS sign the create_rwa_token XDR and submit it to Soroban.
    setStep("awaiting-passkey")
    setStatusMsg("Sign the transaction with your passkey…")
    const submitResult = await signAndSubmit(prepared.txXdr)
    setTxHash(submitResult.hash)

    // 6. Finalize: record the token address + tx hash on the collateral record.
    setStep("finalizing")
    setStatusMsg("Finalizing collateral record…")
    try {
      await collateralApi.update(accessToken, collateral.id, {
        tokenAddress: prepared.predictedTokenAddress ?? undefined,
        collateralData: {
          name: values.name,
          symbol: values.symbol,
          raiseAmount: raiseAmountRaw,
          interestBps: values.interestBps,
          dueDays: Number(values.dueDays),
          description: values.description ?? "",
          txHash: submitResult.hash,
        },
      })
    } catch (err) {
      // Non-blocking — the on-chain token exists; the events poller will still
      // reconcile the record via the rwa_created event.
      console.error("Failed to finalize collateral record", err)
    }

    setStep("done")
    setStatusMsg("")
    toast.success("Collateral issued successfully!", {
      action: {
        label: "View on Stellar Expert ↗",
        onClick: () =>
          window.open(
            `https://stellar.expert/explorer/testnet/tx/${submitResult.hash}`,
            "_blank"
          ),
      },
    })

    return {
      collateralId: collateral.id,
      rwaId,
      txHash: submitResult.hash,
    }
  }

  const mutation = useMutation({
    mutationFn: ({
      values,
      documents,
    }: {
      values: IssueCollateralValues
      documents: PendingDocuments
    }) => issueFlow(values, documents),
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
    setDocProgress({})
  }

  return {
    issue: (v: IssueCollateralValues, docs?: PendingDocuments) =>
      mutation.mutateAsync({ values: v, documents: docs ?? {} }),
    isPending: mutation.isPending,
    step,
    statusMsg,
    preparedTx,
    txHash,
    collateralId,
    docProgress,
    reset,
  }
}
