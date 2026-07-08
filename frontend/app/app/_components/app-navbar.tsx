"use client"

import { useQuery } from "@tanstack/react-query"

import { authApi } from "@/lib/api"

import { AppNavLogo } from "./app-nav-logo"
import { AppNavMenu } from "./app-nav-menu"
import { WalletModal } from "./wallet-modal"

/**
 * Composer for the three navbar regions: logo (left), role-gated page menu
 * (centre), and wallet pill → modal (right). Owns the `me` query so child
 * pieces stay pure/presentational.
 */
export function AppNavbar({ accessToken }: { accessToken: string }) {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const user = meQuery.data

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm">
      <AppNavLogo />
      <AppNavMenu role={user?.role} />
      <WalletModal
        email={user?.email ?? ""}
        role={user?.role}
        firstName={user?.firstName}
        lastName={user?.lastName}
        walletAddress={user?.walletAddress ?? null}
      />
    </header>
  )
}
