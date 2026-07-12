"use client"

import Link from "next/link"
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr"

import { createMetadata } from "@/lib/seo"

import { IssueCollateralForm } from "./issue-collateral-form"

export const metadata = createMetadata({
  title: "Issue Collateral",
  description:
    "Tokenize a maritime receivable and create an on-chain RWA collateral record.",
  path: "/app/collateral/new",
  noIndex: true,
})

export default function NewCollateralPage() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-2xl flex-col gap-4 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/app/collateral"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
        </div>

        <div>
          <h1 className="text-lg font-medium">Issue Collateral</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Tokenize a maritime receivable on Stellar. This creates an on-chain
            RWA token via the factory contract and a local collateral record for
            document management.
          </p>
        </div>

        <IssueCollateralForm />
      </div>
    </div>
  )
}
