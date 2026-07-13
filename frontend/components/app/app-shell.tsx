"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

import { AppNavbar } from "@/app/app/_components/app-navbar"
import { KycBanner } from "@/components/app/kyc-banner"
import { useTokenRefresh } from "@/hooks/use-token-refresh"

/**
 * Authenticated shell: gates /app/* behind a session, renders the top navbar
 * (logo · role-gated page menu · wallet pill), and fills the rest with the
 * route's page content.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, status } = useSession()

  // Proactively refresh the access token before it expires.
  useTokenRefresh()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/app/auth")
  }, [status, router])

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const accessToken = session?.accessToken ?? ""

  return (
    <div className="flex min-h-svh flex-col">
      <AppNavbar accessToken={accessToken} />
      <KycBanner />
      <main className="flex-1">
        <div
          className="mx-auto px-[var(--bk-gutter)]"
          style={{ maxWidth: "var(--bk-page-max)" }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
