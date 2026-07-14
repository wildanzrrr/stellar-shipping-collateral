"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
  ArrowLeft,
  Bank,
  Receipt,
  FileText,
  Coins,
  TrendUp,
  Wallet,
  DownloadSimple,
  Warning,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useWalletBalances } from "@/hooks/use-wallet"

import {
  rwaApi,
  collateralApi,
  getTokenNameSymbol,
  type RwaStatus,
  type CollateralRecord,
} from "@/lib/api"

import { useTxAction } from "./use-tx-action"

const STATUS_STYLES: Record<RwaStatus, string> = {
  Open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Funded: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Settled: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Unknown: "bg-muted text-muted-foreground",
}

const DOC_ORDER = [
  "SHIPPING_CONTRACT",
  "BILL_OF_LADING",
  "PROOF_OF_DELIVERY",
  "COMMERCIAL_INVOICE",
  "NOTICE_OF_ASSIGNMENT",
] as const

/** Format USDC/token base units (10^7 scale) to a human string. */
function formatAmount(raw: string | number): string {
  const n = typeof raw === "string" ? Number(raw) : raw
  if (isNaN(n)) return String(raw)
  return (n / 10_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatBps(bps: string | number): string {
  const n = typeof bps === "string" ? Number(bps) : bps
  if (isNaN(n)) return String(bps)
  return `${(n / 100).toFixed(1)}%`
}

/**
 * Render an on-chain due ledger in human terms — a calendar date plus a
 * relative "in N days". `dueDate` is the backend's approximation of when the
 * ledger closes; we fall back to the raw ledger only if it's unavailable.
 */
function formatDueDate(
  iso: string | null | undefined,
  fallbackLedger: number
): string {
  if (!iso) return `Ledger ${fallbackLedger}`
  const due = new Date(iso)
  if (isNaN(due.getTime())) return `Ledger ${fallbackLedger}`
  const dateStr = due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000)
  if (days > 1) return `${dateStr} · in ${days} days`
  if (days === 1) return `${dateStr} · in 1 day`
  if (days === 0) return `${dateStr} · due today`
  return `${dateStr} · overdue`
}

/** Convert human USDC (e.g. "20.5") to base units string ("205000000"). */
function toBaseUnits(human: string): string {
  const n = Number(human)
  if (!isFinite(n) || n <= 0) throw new Error("Enter a valid amount greater than 0")
  return BigInt(Math.round(n * 10_000_000)).toString()
}

/** Read a string/number field from a collateral record's collateralData. */
function collateralField(
  collateral: CollateralRecord | null | undefined,
  key: string
): string | undefined {
  const v = collateral?.collateralData?.[key]
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  return undefined
}

export default function CollateralDetailPage() {
  const params = useParams<{ rwaId: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""
  const walletId = session?.user?.walletId ?? null
  const walletAddress = session?.user?.walletAddress ?? null
  const role = session?.user?.role

  const rwaId = params.rwaId

  const rwaQuery = useQuery({
    queryKey: ["rwa", rwaId],
    queryFn: () => rwaApi.getRwa(accessToken, rwaId),
    enabled: Boolean(accessToken) && Boolean(rwaId),
    // Don't hammer the RPC when a token simply isn't on-chain yet.
    retry: 1,
    // Keep stats + events fresh automatically (the events poller writes new
    // rows within ~5s of a tx) so users never need to refresh manually — but
    // stop polling a token that isn't on-chain (get_rwa keeps failing).
    refetchInterval: (query) =>
      query.state.status === "error" ? false : 10_000,
  })

  // Local collateral record fallback — only needed when the token isn't
  // on-chain yet (getRwa fails). For on-chain tokens the collateral (with
  // documents) is joined into the getRwa response, which — unlike the
  // user-scoped list — is visible to investors too.
  const collateralQuery = useQuery({
    queryKey: ["collateral-for-rwa", rwaId],
    queryFn: async () => {
      const list = await collateralApi.list(accessToken, 1, 100)
      const match = list.items.find((c) => c.rwaId === rwaId)
      if (!match) return null
      // Fetch full record (with documents) by id.
      return collateralApi.getById(accessToken, match.id)
    },
    enabled: Boolean(accessToken) && Boolean(rwaId) && rwaQuery.isError,
  })

  const txAction = useTxAction({ accessToken, email, walletId })

  const rwa = rwaQuery.data
  // Prefer the collateral joined into the on-chain response (visible to any
  // viewer incl. investors); fall back to the owner's local record for a
  // not-yet-on-chain draft.
  const collateral = rwa?.collateral ?? collateralQuery.data ?? null

  const [buyAmount, setBuyAmount] = useState("")
  const [claimAmount, setClaimAmount] = useState("")

  const tokenInfo = getTokenNameSymbol(collateral)

  const isShipper = role === "SHIPPING_COMPANY"
  const isInvestor = !isShipper
  const isOwner = Boolean(rwa && walletAddress && rwa.shipper === walletAddress)

  // Investor's own on-chain holding (token base units), if any.
  const myHolding =
    (walletAddress && rwa?.investorHoldings?.[walletAddress]) || "0"
  const hasHolding = Number(myHolding) > 0

  const sharesTotalNum = rwa ? Number(rwa.sharesTotal) : 0
  const sharesBoughtNum = rwa ? Number(rwa.sharesBought) : 0
  const sharesAvailableNum = Math.max(0, sharesTotalNum - sharesBoughtNum)

  // `collect_fund` transfers the full raised amount in one shot and can't be
  // repeated, so once a FUND_COLLECTED event lands the action is spent.
  const fundsCollected = Boolean(
    rwa?.events?.some((e) => e.eventType === "FUND_COLLECTED")
  )

  // `settle_debt` flips the offering to Settled on the first call, so it's a
  // one-shot: the shipper repays the full principal owed once, then it's done.
  const debtSettled =
    rwa?.status === "Settled" ||
    Boolean(rwa?.events?.some((e) => e.eventType === "DEBT_SETTLED"))
  const fundedPct =
    sharesTotalNum > 0
      ? Math.min(100, Math.round((sharesBoughtNum / sharesTotalNum) * 100))
      : 0

  // Investor USDC balance — used to validate buy amount before signing.
  const balancesQuery = useWalletBalances({ address: walletAddress })
  const balanceLoaded = !balancesQuery.isLoading && !balancesQuery.isError
  const usdcBalance = Number(balancesQuery.data?.usdc ?? 0)

  const buyNum = Number(buyAmount)
  const buyIsPositive = !isNaN(buyNum) && buyNum > 0
  // Balance is human USDC; shares available is in base units (10^7).
  const buyExceedsBalance = balanceLoaded && buyIsPositive && buyNum > usdcBalance
  const buyExceedsAvailable =
    buyIsPositive && buyNum * 10_000_000 > sharesAvailableNum
  const buyDisabledReason = buyExceedsBalance
    ? `Insufficient USDC — your balance is ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC but you're trying to buy ${buyNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`
    : buyExceedsAvailable
      ? `Only ${formatAmount(sharesAvailableNum)} shares are still available in this offering.`
      : null

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["rwa", rwaId] })
    queryClient.invalidateQueries({ queryKey: ["collateral-for-rwa", rwaId] })
    queryClient.invalidateQueries({ queryKey: ["rwa-list"] })
  }

  // ── Shipper actions ────────────────────────────────────────────────────
  async function handleCollectFund() {
    try {
      const hash = await txAction.execute(
        () => rwaApi.prepareCollectFund(accessToken, rwaId),
        "Collect funds"
      )
      if (hash) invalidate()
    } catch {
      /* error toast surfaced by useTxAction */
    }
  }

  async function handleSettleDebt() {
    if (!rwa) return
    // Always settle the full principal owed (= shares bought, 1:1 USDC). The
    // contract flips the offering to Settled on the first call, so this is a
    // single full repayment rather than a partial/editable amount.
    const amountRaw = rwa.sharesBought
    if (Number(amountRaw) <= 0) {
      toast.error("There is no principal to settle yet")
      return
    }
    try {
      // settle_debt pulls USDC via transfer_from → approve the factory first.
      await txAction.execute(
        () => rwaApi.prepareApprove(accessToken, amountRaw),
        "USDC approval"
      )
      const hash = await txAction.execute(
        () => rwaApi.prepareSettleDebt(accessToken, rwaId, amountRaw),
        "Settle debt"
      )
      if (hash) invalidate()
    } catch {
      /* error toast surfaced by useTxAction */
    }
  }

  // ── Investor actions ───────────────────────────────────────────────────
  async function handleBuyShares() {
    let amountRaw: string
    try {
      amountRaw = toBaseUnits(buyAmount)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid amount")
      return
    }
    if (buyDisabledReason) {
      toast.error(buyDisabledReason)
      return
    }
    try {
      // buy_shares pulls USDC via transfer_from → approve the factory first.
      await txAction.execute(
        () => rwaApi.prepareApprove(accessToken, amountRaw),
        "USDC approval"
      )
      const hash = await txAction.execute(
        () => rwaApi.prepareBuyShares(accessToken, rwaId, amountRaw),
        "Buy shares"
      )
      if (hash) {
        setBuyAmount("")
        invalidate()
      }
    } catch {
      /* error toast surfaced by useTxAction */
    }
  }

  async function handleClaim() {
    let amountRaw: string
    try {
      amountRaw = toBaseUnits(claimAmount)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid amount")
      return
    }
    try {
      const hash = await txAction.execute(
        () => rwaApi.prepareClaim(accessToken, rwaId, amountRaw),
        "Claim"
      )
      if (hash) {
        setClaimAmount("")
        invalidate()
      }
    } catch {
      /* error toast surfaced by useTxAction */
    }
  }

  if (rwaQuery.isLoading || collateralQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <div className="text-xs text-muted-foreground">Loading…</div>
      </div>
    )
  }

  // Only a hard failure: neither on-chain nor a local record exists.
  if (!rwa && !collateral) {
    return (
      <div className="flex flex-col gap-4 py-6 text-sm">
        <p className="text-muted-foreground">
          Could not find this token on-chain or in your records.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/app/collateral")}
        >
          Back to list
        </Button>
      </div>
    )
  }

  // Fall back to off-chain metadata when the token isn't on-chain yet.
  const displayStatus: RwaStatus | string = rwa?.status ?? collateral?.status ?? "DRAFT"
  const displayRaise = rwa?.raiseAmount ?? collateralField(collateral, "raiseAmount")
  const displayInterestBps =
    rwa?.interestBps ?? collateralField(collateral, "interestBps")

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full flex-col gap-4 text-sm">
        {/* Back link */}
        <Link
          href="/app/collateral"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tokenInfo ? (
              <>
                <h1 className="text-lg font-medium">{tokenInfo.name}</h1>
                <Badge variant="secondary" className="font-mono text-xs">
                  {tokenInfo.symbol}
                </Badge>
              </>
            ) : (
              <h1 className="font-mono text-lg font-medium">{rwaId}</h1>
            )}
            <Badge
              className={
                STATUS_STYLES[displayStatus as RwaStatus] ??
                STATUS_STYLES.Unknown
              }
            >
              {displayStatus}
            </Badge>
          </div>
          {rwa?.token && (
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${rwa.token}`}
              target="_blank"
              rel="noopener noreferrer"
              title={rwa.token}
              className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {rwa.token.slice(0, 12)}…
              <ArrowSquareOut size={12} />
            </a>
          )}
        </div>

        {/* Off-chain-only banner */}
        {!rwa && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <Warning size={16} className="mt-0.5 shrink-0" />
            <span>
              This token isn&apos;t on-chain yet — showing your local record.
              On-chain statistics and actions appear once{" "}
              <code className="font-mono">create_rwa_token</code> is confirmed.
            </span>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
          <DetailItem
            label="Raise Amount"
            value={displayRaise ? `$${formatAmount(displayRaise)}` : "—"}
          />
          <DetailItem
            label="Interest Rate"
            value={
              displayInterestBps !== undefined
                ? formatBps(displayInterestBps)
                : "—"
            }
          />
          {rwa ? (
            <>
              <DetailItem
                label="Shares Sold"
                value={`${formatAmount(rwa.sharesBought)} / ${formatAmount(rwa.sharesTotal)}`}
              />
              <DetailItem label="Investors" value={String(rwa.investors)} />
            </>
          ) : (
            <>
              <DetailItem
                label="Due (days)"
                value={collateralField(collateral, "dueDays") ?? "—"}
              />
              <DetailItem label="Status" value={String(displayStatus)} />
            </>
          )}
        </div>

        {/* Funding progress (on-chain only) */}
        {rwa && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Funding progress · {formatAmount(sharesAvailableNum)} available
              </span>
              <span className="font-medium">{fundedPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${fundedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Pools (on-chain only) */}
        {rwa && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
            <DetailItem
              label="Principal Pool"
              value={`$${formatAmount(rwa.principalPool)}`}
            />
            <DetailItem
              label="Interest Pool"
              value={`$${formatAmount(rwa.interestPool)}`}
            />
            <DetailItem
              label="Protocol Fee"
              value={formatBps(rwa.protocolFeeBps)}
            />
            <DetailItem
              label="Due"
              value={formatDueDate(rwa.dueDate, rwa.dueLedger)}
            />
          </div>
        )}

        {/* Investor: your position */}
        {rwa && isInvestor && hasHolding && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-primary" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Your holding
                </span>
                <span className="text-sm font-medium">
                  {formatAmount(myHolding)} shares
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">
                Est. payout at maturity
              </span>
              <span className="text-sm font-medium">
                $
                {formatAmount(
                  (
                    BigInt(myHolding) +
                    (BigInt(myHolding) * BigInt(rwa.interestBps)) /
                      BigInt(10000)
                  ).toString()
                )}
              </span>
            </div>
          </div>
        )}

        {/* Shared action status line */}
        {txAction.statusMsg && (
          <div className="rounded-md bg-muted/50 px-3 py-1.5 text-xs">
            {txAction.statusMsg}
          </div>
        )}

        {/* Shipper actions */}
        {rwa && isShipper && isOwner && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Bank size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-medium">Shipper actions</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              On-chain operations require DFNS passkey signing.
            </p>

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <span className="text-xs font-medium">Collect raised funds</span>
              <p className="text-[11px] text-muted-foreground">
                {fundsCollected
                  ? `Collected ${formatAmount(rwa.sharesBought)} USDC from this offering.`
                  : "Withdraw USDC bought by investors so far."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={
                  txAction.isPending ||
                  Number(rwa.sharesBought) <= 0 ||
                  fundsCollected
                }
                onClick={handleCollectFund}
              >
                <Coins size={16} />
                {fundsCollected ? "Funds Collected" : "Collect Funds"}
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <span className="text-xs font-medium">Settle debt</span>
              <p className="text-[11px] text-muted-foreground">
                {debtSettled
                  ? "Debt settled — investors can now claim their principal and interest."
                  : "Repay the full principal in one payment so investors can claim. Requires a USDC approval first."}
              </p>
              {sharesBoughtNum > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Principal owed:{" "}
                  <span className="font-medium text-foreground">
                    ${formatAmount(rwa.sharesBought)}
                  </span>
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={
                  txAction.isPending || sharesBoughtNum <= 0 || debtSettled
                }
                onClick={handleSettleDebt}
              >
                <Bank size={16} />
                {debtSettled ? "Debt Settled" : "Settle Debt"}
              </Button>
            </div>
          </div>
        )}

        {/* Investor actions */}
        {rwa && isInvestor && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <TrendUp size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-medium">Investor actions</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              On-chain operations require DFNS passkey signing.
            </p>

            {/* Buy shares — only while the offering is Open */}
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <span className="text-xs font-medium">Buy shares</span>
              <p className="text-[11px] text-muted-foreground">
                {rwa.status === "Open"
                  ? `Purchase shares at 1:1 USDC. ${formatAmount(sharesAvailableNum)} available. Requires a USDC approval first.`
                  : "This offering is no longer open for investment."}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="Amount (USDC)"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  disabled={txAction.isPending || rwa.status !== "Open"}
                  className="h-8 max-w-45"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span wrapper so the tooltip works on a disabled button */}
                      <span className="inline-flex">
                        <Button
                          size="sm"
                          disabled={
                            txAction.isPending ||
                            rwa.status !== "Open" ||
                            !buyAmount ||
                            buyExceedsBalance ||
                            buyExceedsAvailable
                          }
                          onClick={handleBuyShares}
                        >
                          <Coins size={16} />
                          Buy Shares
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {buyDisabledReason && (
                      <TooltipContent side="top">
                        {buyDisabledReason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              {rwa.status === "Open" && (
                <span
                  className={[
                    "text-[11px]",
                    buyExceedsBalance
                      ? "text-destructive"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {balancesQuery.isLoading
                    ? "Checking your USDC balance…"
                    : balancesQuery.isError
                      ? "Could not fetch your USDC balance"
                      : `Your USDC balance: ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
                </span>
              )}
            </div>

            {/* Claim — only when Settled and the investor holds shares */}
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <span className="text-xs font-medium">Claim principal + interest</span>
              <p className="text-[11px] text-muted-foreground">
                {rwa.status !== "Settled"
                  ? "Available once the shipper has settled the debt."
                  : hasHolding
                    ? `You hold ${formatAmount(myHolding)} shares. Claim burns them and pays principal + interest.`
                    : "You have no shares to claim in this offering."}
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="Amount (shares)"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  disabled={
                    txAction.isPending || rwa.status !== "Settled" || !hasHolding
                  }
                  className="h-8 max-w-45"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    txAction.isPending || rwa.status !== "Settled" || !hasHolding
                  }
                  onClick={() => setClaimAmount(formatAmount(myHolding))}
                >
                  Max
                </Button>
                <Button
                  size="sm"
                  disabled={
                    txAction.isPending ||
                    rwa.status !== "Settled" ||
                    !hasHolding ||
                    !claimAmount
                  }
                  onClick={handleClaim}
                >
                  <Wallet size={16} />
                  Claim
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Collateral record + documents */}
        {collateral ? (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Collateral record</h3>
              <Badge>{collateral.status}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">ID: </span>
                <code className="font-mono">{collateral.id}</code>
              </div>
              {collateral.tokenAddress && (
                <div>
                  <span className="text-muted-foreground">Token: </span>
                  <code className="font-mono">
                    {collateral.tokenAddress.slice(0, 16)}…
                  </code>
                </div>
              )}
            </div>

            {collateralField(collateral, "description") && (
              <p className="mt-1 text-xs text-muted-foreground">
                {collateralField(collateral, "description")}
              </p>
            )}

            <div className="mt-2 flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Documents ({collateral.documents?.length ?? 0})
              </span>
              {collateral.documents && collateral.documents.length > 0 ? (
                DOC_ORDER.flatMap((docType) => {
                  const docs = collateral.documents!.filter(
                    (d) => d.documentType === docType
                  )
                  return docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-medium">{doc.fileName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {docType.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={async () => {
                          try {
                            const result = await collateralApi.getDocumentUrl(
                              accessToken,
                              collateral.id,
                              doc.id
                            )
                            window.open(result.signedUrl, "_blank")
                          } catch {
                            toast.error("Could not open document")
                          }
                        }}
                      >
                        <DownloadSimple size={14} />
                      </Button>
                    </div>
                  ))
                })
              ) : (
                <p className="text-xs text-muted-foreground">
                  No documents attached.
                </p>
              )}
            </div>
          </div>
        ) : (
          isShipper && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center">
              <FileText size={24} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                No local collateral record linked to this RWA yet.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/collateral/new">Issue collateral record</Link>
              </Button>
            </div>
          )
        )}

        {/* Events */}
        {rwa && rwa.events && rwa.events.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-medium">Transaction events</h3>
            </div>
            <div className="flex flex-col gap-1">
              {rwa.events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ev.eventType}</Badge>
                    {ev.investorAddress && (
                      <code className="font-mono text-muted-foreground">
                        {ev.investorAddress.slice(0, 10)}…
                      </code>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {ev.amount && <span>{formatAmount(ev.amount)} USDC</span>}
                    <span>L{ev.ledger}</span>
                    {ev.txHash && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`View tx ${ev.txHash} on Stellar Expert`}
                        className="flex items-center gap-1 font-mono text-primary hover:underline"
                      >
                        {ev.txHash.slice(0, 6)}…
                        <ArrowSquareOut size={12} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
