"use client"

import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Check, Copy } from "@phosphor-icons/react/dist/ssr"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

interface WalletQrProps {
  address: string
  className?: string
}

/**
 * QR code of the wallet's Stellar address for deposits. Renders a white
 * padded container so the QR scans cleanly on dark mode.
 */
export function WalletQr({ address, className }: WalletQrProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success("Address copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy address")
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="rounded-xl border bg-white p-4">
        <QRCodeSVG
          value={address || "—"}
          size={160}
          level="M"
          includeMargin={false}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Scan this QR code with any Stellar-compatible wallet to deposit funds.
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Copy wallet address"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied!" : "Copy address"}
      </button>
    </div>
  )
}
