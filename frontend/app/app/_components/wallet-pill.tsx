"use client"

import { CaretDown } from "@phosphor-icons/react/dist/ssr"

import { DialogTrigger } from "@/components/ui/dialog"
import { shortAddress } from "@/hooks/use-wallet"

interface WalletPillProps {
  walletAddress: string | null
}

/**
 * Pill-shaped trigger that opens the wallet modal. Shows the ellipsised
 * wallet address (first 4 … last 4).
 */
export function WalletPill({ walletAddress }: WalletPillProps) {
  return (
    <DialogTrigger asChild>
      <button
        className="group inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Open wallet menu"
      >
        <span className="font-mono text-xs">
          {shortAddress(walletAddress) ?? "—"}
        </span>
        <CaretDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </button>
    </DialogTrigger>
  )
}
