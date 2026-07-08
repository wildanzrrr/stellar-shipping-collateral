import type { Metadata } from "next"

import { createMetadata } from "@/lib/seo"
import { AuthSessionProvider } from "@/components/session-provider"
import { QueryProvider } from "@/components/query-provider"

// The /app surface is the authenticated product (wallet dashboard + auth).
// Kept out of search results; access is gated by middleware.
export const metadata: Metadata = createMetadata({
  title: "App",
  description:
    "Your passkey-custodied Stellar wallet — DFNS delegated custody, no seed phrase.",
  path: "/app",
  noIndex: true,
})

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthSessionProvider>
      <QueryProvider>{children}</QueryProvider>
    </AuthSessionProvider>
  )
}
