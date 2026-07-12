"use client"

import { useSession } from "next-auth/react"

import { RwaList } from "../../_components/rwa-list"

/**
 * Collateral listing page.
 * - Shipping companies see their own issued RWAs (with "Issue collateral" CTA)
 * - Investors see all open RWA offerings to invest in
 */
export default function CollateralPage() {
  const { data: session } = useSession()
  const role = session?.user?.role

  const variant = role === "SHIPPING_COMPANY" ? "shipper" : "investor"

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-2xl flex-col gap-4 text-sm">
        <div>
          <h1 className="text-lg font-medium">
            {variant === "shipper" ? "My collateral" : "Available collateral"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {variant === "shipper"
              ? "Your tokenized maritime receivables and their on-chain status."
              : "Browse tokenized maritime receivables offered as collateral by shipping companies."}
          </p>
        </div>

        <RwaList variant={variant} />
      </div>
    </div>
  )
}
