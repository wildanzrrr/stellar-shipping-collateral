"use client"

import { Check, Copy } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"
import { toast } from "sonner"

import type { UserRole } from "@/lib/api"
import { ROLE_LABELS } from "@/lib/api"
import { shortAddress } from "@/hooks/use-wallet"

interface WalletProfileProps {
  email: string
  role?: UserRole
  firstName?: string | null
  lastName?: string | null
  walletAddress: string | null
}

/**
 * Profile card shown at the top of the wallet modal — account, role badge,
 * display name, and the ellipsised wallet address with a copy button.
 */
export function WalletProfile({
  email,
  role,
  firstName,
  lastName,
  walletAddress,
}: WalletProfileProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!walletAddress) return
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      toast.success("Address copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy address")
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Account</span>
        {role && (
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
            {ROLE_LABELS[role]}
          </span>
        )}
      </div>
      <p className="mt-1 font-medium">{email}</p>
      {(firstName || lastName) && (
        <p className="text-sm text-muted-foreground">
          {[firstName, lastName].filter(Boolean).join(" ")}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Address</span>
        <code className="font-mono text-xs">{shortAddress(walletAddress)}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex cursor-pointer items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Copy wallet address"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
