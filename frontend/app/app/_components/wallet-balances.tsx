"use client"

import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"

import type { WalletBalances } from "@/hooks/use-wallet"

function fmtAmount(value: string | null, symbol: string) {
  if (value === null) return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return value
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`
}

interface WalletBalancesProps {
  balances: WalletBalances | undefined
  isLoading: boolean
}

/**
 * Native XLM + USDC balance rows. When USDC balance is zero or missing, a
 * link to the Circle testnet faucet is shown below the USDC row.
 */
export function WalletBalancesView({
  balances,
  isLoading,
}: WalletBalancesProps) {
  const usdc = balances?.usdc ?? null
  const hasUsdc = usdc !== null && Number(usdc) > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <span className="text-sm font-medium">Native XLM</span>
        <span className="font-mono text-sm">
          {isLoading ? "…" : fmtAmount(balances?.native ?? null, "XLM")}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">USDC</span>
          <span className="font-mono text-sm">
            {isLoading ? "…" : fmtAmount(usdc, "USDC")}
          </span>
        </div>
        {!hasUsdc && (
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
          >
            No USDC yet — get testnet faucet here
            <ArrowSquareOut className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
