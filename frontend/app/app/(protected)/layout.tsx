import { AppShell } from "@/components/app/app-shell"
import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "Dashboard",
  description:
    "Your passkey-custodied Stellar wallet dashboard — investments, collateral, and signing.",
  path: "/app",
  noIndex: true,
})

/**
 * Route group for authenticated /app/* pages.  AppShell gates on session
 * status and renders the navbar + wallet modal.  /app/auth sits outside this
 * group so it never hits the "Loading…" fallback or the redirect loop.
 */
export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>
}
