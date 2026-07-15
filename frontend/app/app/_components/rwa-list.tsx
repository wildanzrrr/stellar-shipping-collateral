"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Package, Plus } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  rwaApi,
  getTokenNameSymbol,
  type KybStatus,
  type RwaSummary,
  type RwaStatus,
} from "@/lib/api"

const STATUS_STYLES: Record<RwaStatus, string> = {
  Open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Funded: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Settled: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Unknown: "bg-muted text-muted-foreground",
}

function formatAmount(raw: string | number): string {
  const n = typeof raw === "string" ? Number(raw) : raw
  if (isNaN(n)) return String(raw)
  // USDC has 7 decimals
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

interface RwaListProps {
  /**
   * - `shipper`: the shipping company's own issued RWAs (+ "Issue collateral")
   * - `investor`: all open offerings (the "Available collateral" page)
   * - `my-investment`: only offerings the investor holds shares in
   */
  variant: "shipper" | "investor" | "my-investment"
  /** Shipper only — disables "Issue collateral" until KYB is completed. */
  kybStatus?: KybStatus
}

/**
 * Lists RWAs from the factory contract, joined with local collateral data.
 * - Shipper variant: shows "Issue collateral" button + their RWAs
 *   (button is disabled until KYB status is COMPLETED)
 * - Investor variant: shows all open RWAs as investable offerings
 * - My-investment variant: shows only offerings the investor already holds
 */
export function RwaList({ variant, kybStatus }: RwaListProps) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const query = useQuery({
    queryKey: ["rwa-list", variant],
    queryFn: () =>
      rwaApi.list(accessToken, 1, 20, { mine: variant === "my-investment" }),
    enabled: Boolean(accessToken),
  })

  const items = query.data?.items ?? []

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Loading…
      </div>
    )
  }

  const kybOk = kybStatus === "COMPLETED"

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <Package size={32} className="text-muted-foreground" />
        <div>
          <p className="font-medium">
            {variant === "shipper"
              ? "No collateral yet"
              : variant === "my-investment"
                ? "No investments yet"
                : "No offerings available"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {variant === "shipper"
              ? "Tokenize your first maritime receivable to get started."
              : variant === "my-investment"
                ? "You haven't bought shares in any offering yet."
                : "When shipping companies tokenize receivables, they'll appear here."}
          </p>
        </div>
        {variant === "shipper" &&
          (kybOk ? (
            <Button asChild size="sm">
              <Link href="/app/collateral/new">
                <Plus size={16} />
                Issue collateral
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-block">
                  <Button size="sm" disabled>
                    <Plus size={16} />
                    Issue collateral
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Complete KYB verification first</TooltipContent>
            </Tooltip>
          ))}
        {variant === "my-investment" && (
          <Button asChild size="sm" variant="outline">
            <Link href="/app/collateral">Browse available collateral</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {variant === "shipper" && (
        <div className="flex justify-end">
          {kybOk ? (
            <Button asChild size="sm">
              <Link href="/app/collateral/new">
                <Plus size={16} />
                Issue collateral
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-block">
                  <Button size="sm" disabled>
                    <Plus size={16} />
                    Issue collateral
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Complete KYB verification first</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {items.map((rwa) => (
          <RwaCard key={rwa.id} rwa={rwa} />
        ))}
      </div>
    </div>
  )
}

function RwaCard({ rwa }: { rwa: RwaSummary }) {
  const fundedPct =
    rwa.sharesTotal && Number(rwa.sharesTotal) > 0
      ? Math.min(
          100,
          Math.round((Number(rwa.sharesBought) / Number(rwa.sharesTotal)) * 100)
        )
      : 0

  const tokenInfo = getTokenNameSymbol(rwa.collateral)

  return (
    <Link
      href={`/app/collateral/${encodeURIComponent(rwa.id)}`}
      className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tokenInfo ? (
            <>
              <span className="font-medium">{tokenInfo.name}</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {tokenInfo.symbol}
              </Badge>
            </>
          ) : (
            <span className="font-medium">{rwa.id}</span>
          )}
          {rwa.token && (
            <code className="font-mono text-xs text-muted-foreground">
              {rwa.token.slice(0, 8)}…
            </code>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rwa.myShares && Number(rwa.myShares) > 0 && (
            <Badge variant="secondary" className="text-xs">
              You: {formatAmount(rwa.myShares)}
            </Badge>
          )}
          <Badge className={STATUS_STYLES[rwa.status] ?? STATUS_STYLES.Unknown}>
            {rwa.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Raise: </span>
          <span className="font-medium">${formatAmount(rwa.raiseAmount)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Rate: </span>
          <span className="font-medium">{formatBps(rwa.interestBps)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Funded: </span>
          <span className="font-medium">{fundedPct}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Collateral: </span>
          <span className="font-medium">
            {rwa.collateral ? "✓ Linked" : "—"}
          </span>
        </div>
      </div>

      {/* Funding progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${fundedPct}%` }}
        />
      </div>
    </Link>
  )
}
