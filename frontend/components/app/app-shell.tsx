"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

import { AppNavbar } from "@/app/app/_components/app-navbar"

/**
 * Authenticated shell: gates /app/* behind a session, renders the top navbar
 * (logo · role-gated page menu · wallet pill), and fills the rest with the
 * route's page content.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: session, status } = useSession()

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
      <main className="flex-1">{children}</main>
    </div>
  )
}
