"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Receipt } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@/components/ui/badge"
import { rwaApi, type TransactionEvent } from "@/lib/api"

export const metadata = {
  title: "History",
  description: "Your transaction and event history.",
}

const EVENT_LABELS: Record<string, string> = {
  RWA_CREATED: "RWA Created",
  SHARES_BOUGHT: "Shares Bought",
  FUND_COLLECTED: "Fund Collected",
  DEBT_SETTLED: "Debt Settled",
  CLAIMED: "Claimed",
}

function formatAmount(raw: string | number | null): string {
  if (!raw) return "—"
  const n = typeof raw === "string" ? Number(raw) : raw
  if (isNaN(n)) return String(raw)
  return (n / 10_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function HistoryPage() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: () => rwaApi.listEvents(accessToken),
    enabled: Boolean(accessToken),
  })

  const events = eventsQuery.data?.items ?? []

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-2xl flex-col gap-4 text-sm">
        <div>
          <h1 className="text-lg font-medium">History</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Your on-chain transaction events from the factory contract.
          </p>
        </div>

        {eventsQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <Receipt size={32} className="text-muted-foreground" />
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Once you issue collateral or invest in offerings, on-chain
                events will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((ev: TransactionEvent) => (
              <Link
                key={ev.id}
                href={`/app/collateral/${encodeURIComponent(ev.rwaId)}`}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                  </Badge>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{ev.rwaId}</span>
                    {ev.investorAddress && (
                      <code className="font-mono text-xs text-muted-foreground">
                        {ev.investorAddress.slice(0, 12)}…
                      </code>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {ev.amount && (
                    <span className="font-medium">
                      {formatAmount(ev.amount)} USDC
                    </span>
                  )}
                  <span>L{ev.ledger}</span>
                  <span>{formatTime(ev.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
