import type { Metadata } from "next"

import { createMetadata } from "@/lib/seo"

// The dashboard page is a client component, so its metadata lives here —
// the segment layout — using the same reusable factory as every route.
export const metadata: Metadata = createMetadata({
  title: "Dashboard",
  description:
    "Create a passkey-custodied Stellar Testnet wallet and sign your first transaction — DFNS delegated custody, no seed phrase.",
  path: "/dashboard",
  noIndex: true, // wallet demo surface — keep it out of search results
})

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
