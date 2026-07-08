"use client"

import type { UserRole } from "@/lib/api"
import { ROLE_LABELS } from "@/lib/api"

interface WalletProfileProps {
  email: string
  role?: UserRole
  firstName?: string | null
  lastName?: string | null
  walletAddress: string | null
}

/**
 * Profile card shown at the top of the wallet modal — account, role badge,
 * display name, and the full wallet address.
 */
export function WalletProfile({
  email,
  role,
  firstName,
  lastName,
  walletAddress,
}: WalletProfileProps) {
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
        <code className="font-mono text-xs break-all">{walletAddress}</code>
      </div>
    </div>
  )
}
