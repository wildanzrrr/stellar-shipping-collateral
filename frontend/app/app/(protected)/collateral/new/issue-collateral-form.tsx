"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"

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

import {
  issueCollateralSchema,
  type IssueCollateralValues,
} from "./issue-collateral-schema"
import { useIssueCollateral, type IssueStep } from "./use-issue-collateral"
import { DocumentUpload } from "./document-upload"

const STEP_LABELS: Record<IssueStep, string> = {
  idle: "",
  preparing: "1/4 Preparing transaction…",
  "awaiting-passkey": "2/4 Sign with passkey…",
  submitting: "3/4 Submitting to Stellar…",
  "creating-collateral": "4/4 Creating collateral record…",
  done: "✓ Complete",
}

/**
 * Multi-step issue-collateral form:
 * - Token details (tokenId, name, symbol, raise amount, interest, due days)
 * - DFNS passkey signing of the create_rwa_token transaction
 * - On-chain submission via Soroban RPC
 * - Local collateral record creation
 * - Document upload (after on-chain tx succeeds)
 */
export function IssueCollateralForm() {
  const router = useRouter()
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""
  const walletId = session?.user?.walletId ?? null

  const form = useForm<IssueCollateralValues>({
    resolver: zodResolver(issueCollateralSchema),
    defaultValues: {
      tokenId: "",
      name: "",
      symbol: "",
      raiseAmount: "",
      interestBps: "",
      dueDays: 30,
      description: "",
    },
  })

  const issue = useIssueCollateral({ accessToken, email, walletId })

  const isDone = issue.step === "done"
  const isBusy = issue.isPending

  function onSubmit(values: IssueCollateralValues) {
    issue.issue(values)
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="tokenId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Token ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. INV-2025-1023" {...field} />
                  </FormControl>
                  <FormDescription>
                    Unique identifier for this receivable on-chain
                  </FormDescription>
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

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Maritime Invoice #1023" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="raiseAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raise Amount (USDC)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 50000" type="number" {...field} />
                  </FormControl>
                  <FormDescription>In USDC units (7 decimals)</FormDescription>
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

          {!isDone && (
            <Button type="submit" disabled={isBusy} className="w-fit">
              {isBusy ? "Processing…" : "Issue Collateral"}
            </Button>
          )}
        </form>
      </Form>

      {/* Post-issuance: document upload */}
      {isDone && issue.collateralId && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Collateral created — upload supporting documents
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
          <DocumentUpload
            accessToken={accessToken}
            collateralId={issue.collateralId}
            documents={[]}
          />
        </div>
      )}
    </div>
  )
}
