"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  ArrowLeft,
  Bank,
  Receipt,
  FileText,
  Coins,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { rwaApi, collateralApi, type RwaStatus } from "@/lib/api"

import { useTxAction } from "./use-tx-action"

const STATUS_STYLES: Record<RwaStatus, string> = {
  Open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Funded: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Settled: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Unknown: "bg-muted text-muted-foreground",
}

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

export default function CollateralDetailPage() {
  const params = useParams<{ rwaId: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""
  const walletId = session?.user?.walletId ?? null
  const role = session?.user?.role

  const rwaId = params.rwaId

  const rwaQuery = useQuery({
    queryKey: ["rwa", rwaId],
    queryFn: () => rwaApi.getRwa(accessToken, rwaId),
    enabled: Boolean(accessToken) && Boolean(rwaId),
  })

  // Find local collateral record — query the list endpoint and filter
  const collateralQuery = useQuery({
    queryKey: ["collateral-for-rwa", rwaId],
    queryFn: async () => {
      const list = await collateralApi.list(accessToken, 1, 100)
      return list.items.find((c) => c.rwaId === rwaId) ?? null
    },
    enabled: Boolean(accessToken) && Boolean(rwaId),
  })

  const txAction = useTxAction({ accessToken, email, walletId })

  const rwa = rwaQuery.data
  const collateral = collateralQuery.data

  const isShipper = role === "SHIPPING_COMPANY"
  const fundedPct =
    rwa?.sharesTotal && Number(rwa.sharesTotal) > 0
      ? Math.min(
          100,
          Math.round((Number(rwa.sharesBought) / Number(rwa.sharesTotal)) * 100)
        )
      : 0

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["rwa", rwaId] })
    queryClient.invalidateQueries({ queryKey: ["rwa-list"] })
  }

  async function handleCollectFund() {
    const hash = await txAction.execute(
      () => rwaApi.prepareCollectFund(accessToken, rwaId),
      "collect_fund"
    )
    if (hash) invalidate()
  }

  async function handleSettleDebt() {
    const principalAmount = window.prompt(
      "Enter principal amount to settle (in USDC base units):"
    )
    if (!principalAmount) return
    const hash = await txAction.execute(
      () => rwaApi.prepareSettleDebt(accessToken, rwaId, principalAmount),
      "settle_debt"
    )
    if (hash) invalidate()
  }

  if (rwaQuery.isLoading || collateralQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <div className="text-xs text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (rwaQuery.isError || !rwa) {
    return (
      <div className="flex flex-col gap-4 py-6 text-sm">
        <p className="text-muted-foreground">
          Could not load RWA details. The contract may not have this token.
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

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-2xl flex-col gap-4 text-sm">
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
            <h1 className="text-lg font-medium">{rwa.id}</h1>
            <Badge
              className={STATUS_STYLES[rwa.status] ?? STATUS_STYLES.Unknown}
            >
              {rwa.status}
            </Badge>
          </div>
          {rwa.token && (
            <code className="font-mono text-xs text-muted-foreground">
              {rwa.token.slice(0, 12)}…
            </code>
          )}
        </div>

        {/* On-chain details */}
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
          <DetailItem
            label="Raise Amount"
            value={`$${formatAmount(rwa.raiseAmount)}`}
          />
          <DetailItem
            label="Interest Rate"
            value={formatBps(rwa.interestBps)}
          />
          <DetailItem
            label="Shares"
            value={`${formatAmount(rwa.sharesBought)} / ${formatAmount(rwa.sharesTotal)}`}
          />
          <DetailItem label="Due Ledger" value={String(rwa.dueLedger)} />
        </div>

        {/* Funding progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Funding progress</span>
            <span className="font-medium">{fundedPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${fundedPct}%` }}
            />
          </div>
        </div>

        {/* Pools (if available) */}
        {rwa.principalPool !== undefined && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              label="Fee Pool"
              value={`$${formatAmount(rwa.protocolFeePool)}`}
            />
          </div>
        )}

        {/* Shipper actions */}
        {isShipper && (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Shipper actions</h3>
            <p className="text-xs text-muted-foreground">
              On-chain operations require DFNS passkey signing.
            </p>
            {txAction.statusMsg && (
              <div className="rounded-md bg-muted/50 px-3 py-1.5 text-xs">
                {txAction.statusMsg}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={txAction.isPending || rwa.status !== "Funded"}
                onClick={handleCollectFund}
              >
                <Coins size={16} />
                Collect Funds
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={txAction.isPending || rwa.status !== "Funded"}
                onClick={handleSettleDebt}
              >
                <Bank size={16} />
                Settle Debt
              </Button>
            </div>
          </div>
        )}

        {/* Collateral record */}
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
            {collateral.collateralData && (
              <div className="mt-2 rounded-md bg-muted/30 p-2 text-xs">
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(collateral.collateralData, null, 2)}
                </pre>
              </div>
            )}
            {collateral.documents && collateral.documents.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Documents ({collateral.documents.length})
                </span>
                {collateral.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                  >
                    <FileText size={12} className="text-muted-foreground" />
                    <span className="font-medium">{doc.fileName}</span>
                    <span className="text-muted-foreground">
                      · {doc.documentType.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
        {rwa.events && rwa.events.length > 0 && (
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
