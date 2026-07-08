"use client"

import type { UserRole } from "@/lib/api"

interface RolePanelProps {
  role?: UserRole
}

/**
 * Role-specific dashboard intro. This is where the two experiences diverge —
 * extend each branch as the Investor / Shipping Company surfaces are built out.
 */
export function RolePanel({ role }: RolePanelProps) {
  if (role === "SHIPPING_COMPANY") {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Shipping Company workspace</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tokenize maritime receivables and open financing offerings against
          them. Investor funding settles to your delegated Stellar wallet.
        </p>
      </div>
    )
  }
  if (role === "INVESTOR") {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Investor workspace</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Browse open receivable offerings and fund them. Positions and
          repayments settle to your delegated Stellar wallet.
        </p>
      </div>
    )
  }
  return null
}
