import { Package } from "@phosphor-icons/react/dist/ssr"

import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "Available collateral",
  description:
    "Browse tokenized maritime receivables offered as collateral by shipping companies.",
  path: "/app/collateral",
  noIndex: true,
})

export default function CollateralPage() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <div>
          <h1 className="text-lg font-medium">Available collateral</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse tokenized maritime receivables offered as collateral.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <Package size={32} className="text-muted-foreground" />
          <div>
            <p className="font-medium">No offerings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When shipping companies tokenize receivables, they&rsquo;ll appear
              here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
