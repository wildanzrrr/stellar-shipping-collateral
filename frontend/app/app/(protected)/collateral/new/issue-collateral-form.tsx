"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"
import {
  TrashSimple,
  CloudArrowUp,
  Check,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  issueCollateralSchema,
  type IssueCollateralValues,
  type PendingDocuments,
  DOCUMENT_SLOTS,
} from "./issue-collateral-schema"
import { useIssueCollateral, type IssueStep } from "./use-issue-collateral"
import { useEstimatedAllowance } from "./use-estimated-allowance"

const STEP_LABELS: Record<IssueStep, string> = {
  idle: "",
  "creating-collateral": "1/6 Creating collateral record…",
  "uploading-documents": "2/6 Uploading documents…",
  approving: "3/6 Approving USDC allowance…",
  preparing: "4/6 Preparing transaction…",
  "awaiting-passkey": "Sign with passkey…",
  submitting: "5/6 Submitting to Stellar…",
  finalizing: "6/6 Finalizing…",
  done: "✓ Complete",
}

/**
 * Multi-step issue-collateral form:
 * - Token details (tokenId, name, symbol, raise amount, interest, due days)
 * - Optional supporting documents (uploaded after on-chain tx + collateral record)
 * - DFNS passkey signing of the create_rwa_token transaction
 * - On-chain submission via Soroban RPC
 * - Local collateral record creation
 * - Document upload to GCS (non-blocking — failures don't revert the tx)
 */
export function IssueCollateralForm() {
  const router = useRouter()
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""
  const walletId = session?.user?.walletId ?? null
  const walletAddress = session?.user?.walletAddress ?? null

  // Documents selected in the form before submission (not part of Zod schema).
  // Keyed by document type — each type has its own file slot.
  const [pendingDocs, setPendingDocs] = useState<PendingDocuments>({})

  // Drag-state per slot for visual feedback on drag-and-drop.
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  const attachedCount = Object.values(pendingDocs).filter(Boolean).length

  const form = useForm<IssueCollateralValues>({
    resolver: zodResolver(issueCollateralSchema),
    defaultValues: {
      name: "",
      symbol: "",
      raiseAmount: "",
      interestBps: "",
      dueDays: 30,
      description: "",
    },
  })

  const issue = useIssueCollateral({ accessToken, email, walletId })

  // Watch raiseAmount + interestBps to estimate the USDC allowance the
  // factory will pull, then compare against the shipper's on-chain balance.
  const raiseAmount = form.watch("raiseAmount")
  const interestBps = form.watch("interestBps")
  const allowance = useEstimatedAllowance({
    walletAddress,
    raiseAmount,
    interestBps,
  })

  const isDone = issue.step === "done"
  const isBusy = issue.isPending
  const hasInsufficientBalance =
    !allowance.isLoading &&
    !allowance.isError &&
    Number(raiseAmount) > 0 &&
    Number(interestBps) > 0 &&
    !allowance.hasSufficientBalance

  function onSubmit(values: IssueCollateralValues) {
    issue.issue(values, pendingDocs)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      {issue.statusMsg && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium">{STEP_LABELS[issue.step]}</span>
          <span className="text-muted-foreground">{issue.statusMsg}</span>
        </div>
      )}

      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Token Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Maritime Invoice #1023"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. INV1023"
                      maxLength={8}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="raiseAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raise Amount (USDC)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 50000"
                      type="number"
                      step="any"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Amount in USDC</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interestBps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest Rate (bps)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 500 (5%)"
                      type="number"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Basis points (100 = 1%, 500 = 5%)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due (days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>Days until maturity</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                    placeholder="Describe the maritime receivable…"
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Document upload (optional — uploaded after on-chain tx) */}
          {!isDone && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  Supporting documents (optional)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Uploaded after the on-chain tx succeeds
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DOCUMENT_SLOTS.map((slot) => {
                  const file = pendingDocs[slot.key]
                  const isDragging = draggingKey === slot.key
                  const upload = issue.docProgress[slot.key]
                  return (
                    <div key={slot.key} className="flex flex-col gap-1.5">
                      <Label className="text-[11px] font-medium">
                        {slot.label}
                      </Label>
                      <label
                        htmlFor={`file-${slot.key}`}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDraggingKey(slot.key)
                        }}
                        onDragLeave={() => setDraggingKey(null)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDraggingKey(null)
                          const f = e.dataTransfer.files?.[0]
                          if (f) {
                            setPendingDocs((prev) => ({
                              ...prev,
                              [slot.key]: f,
                            }))
                          }
                        }}
                        className={[
                          "relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-center transition-colors",
                          isDragging
                            ? "border-primary bg-primary/5"
                            : file
                              ? "border-primary/40 bg-primary/5"
                              : "border-muted-foreground/30 bg-muted/10 hover:border-primary/50 hover:bg-muted/20",
                          isBusy ? "pointer-events-none opacity-50" : "",
                        ].join(" ")}
                      >
                        <input
                          id={`file-${slot.key}`}
                          type="file"
                          disabled={isBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              setPendingDocs((prev) => ({
                                ...prev,
                                [slot.key]: f,
                              }))
                            }
                            e.target.value = ""
                          }}
                          className="sr-only"
                        />
                        {file ? (
                          <>
                            <Check
                              size={28}
                              weight="bold"
                              className={
                                upload?.status === "error"
                                  ? "text-destructive"
                                  : "text-primary"
                              }
                            />
                            <span className="line-clamp-2 text-[11px] font-medium">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB · click to
                              replace
                            </span>
                          </>
                        ) : (
                          <>
                            <CloudArrowUp
                              size={28}
                              className="text-muted-foreground"
                            />
                            <span className="text-[11px] font-medium">
                              Drag & drop or click
                            </span>
                            <span className="line-clamp-2 text-[10px] text-muted-foreground">
                              {slot.description}
                            </span>
                          </>
                        )}

                        {/* Per-document upload progress bar */}
                        {upload && (
                          <div className="absolute inset-x-2 bottom-2 flex flex-col gap-0.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={[
                                  "h-full rounded-full transition-all duration-200",
                                  upload.status === "error"
                                    ? "bg-destructive"
                                    : upload.status === "done"
                                      ? "bg-primary"
                                      : "bg-primary/70",
                                ].join(" ")}
                                style={{
                                  width: `${
                                    upload.status === "error"
                                      ? 100
                                      : upload.progress
                                  }%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground">
                              {upload.status === "done"
                                ? "Uploaded ✓"
                                : upload.status === "error"
                                  ? "Upload failed"
                                  : `Uploading… ${upload.progress}%`}
                            </span>
                          </div>
                        )}
                      </label>
                      {file && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() =>
                            setPendingDocs((prev) => {
                              const next = { ...prev }
                              delete next[slot.key]
                              return next
                            })
                          }
                          className="h-7 self-end text-xs"
                        >
                          <TrashSimple size={12} />
                          Remove
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!isDone && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Inline allowance estimate */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {allowance.isLoading ? (
                  <span>Checking USDC balance…</span>
                ) : allowance.isError ? (
                  <span className="text-destructive">
                    Could not fetch USDC balance
                  </span>
                ) : (
                  <>
                    <span>
                      Est. upfront:{" "}
                      <span className="font-medium text-foreground">
                        {allowance.estimatedAllowanceUsdc.toLocaleString(
                          undefined,
                          { maximumFractionDigits: 7 }
                        )}{" "}
                        USDC
                      </span>
                    </span>
                    <span>
                      Your balance:{" "}
                      <span className="font-medium text-foreground">
                        {allowance.usdcBalanceUsdc.toLocaleString(undefined, {
                          maximumFractionDigits: 7,
                        })}{" "}
                        USDC
                      </span>
                    </span>
                  </>
                )}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper so tooltip works on disabled button */}
                    <span className="inline-flex">
                      <Button
                        type="submit"
                        disabled={isBusy || hasInsufficientBalance}
                        className="w-fit"
                      >
                        {isBusy
                          ? "Processing…"
                          : hasInsufficientBalance
                            ? "Insufficient USDC"
                            : "Issue Collateral"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {hasInsufficientBalance && (
                    <TooltipContent side="top">
                      Your USDC balance ({" "}
                      {allowance.usdcBalanceUsdc.toLocaleString(undefined, {
                        maximumFractionDigits: 7,
                      })}{" "}
                      USDC) is insufficient. You need at least{" "}
                      {allowance.estimatedAllowanceUsdc.toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 7,
                        }
                      )}{" "}
                      USDC (shortfall:{" "}
                      {allowance.shortfallUsdc.toLocaleString(undefined, {
                        maximumFractionDigits: 7,
                      })}{" "}
                      USDC) to cover the upfront allowance.
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </form>
      </Form>

      {/* Post-issuance: success summary */}
      {isDone && issue.collateralId && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Collateral issued successfully
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/app/collateral/${issue.collateralId}`)
                }
              >
                View details
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  issue.reset()
                  form.reset()
                  setPendingDocs({})
                  setDraggingKey(null)
                }}
              >
                Issue another
              </Button>
            </div>
          </div>
          {issue.txHash && (
            <p className="text-xs text-muted-foreground">
              Transaction hash:{" "}
              <code className="font-mono">{issue.txHash.slice(0, 16)}…</code>
            </p>
          )}
          {attachedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {attachedCount} document(s) uploaded to GCS. You can manage
              documents from the collateral details page.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
