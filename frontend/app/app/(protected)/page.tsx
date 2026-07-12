"use client"

import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"

import { authApi, ROLE_LABELS, type UserRole } from "@/lib/api"

import { RolePanel } from "../_components/role-panel"
import { WalletInfo } from "../_components/wallet-info"
import { SignMessageForm } from "../_components/sign-message-form"
import { useSignMessage } from "../_components/use-sign-message"
import { RwaList } from "../_components/rwa-list"

export default function AppDashboard() {
  const { data: session } = useSession()

  const accessToken = session?.accessToken ?? ""
  const email = session?.user?.email ?? ""

  // Authoritative user + wallet (created & friendbot-funded at registration).
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const walletId = meQuery.data?.walletId ?? session?.user?.walletId ?? null
  const walletAddress =
    meQuery.data?.walletAddress ?? session?.user?.walletAddress ?? null
  const role: UserRole | undefined = meQuery.data?.role ?? session?.user?.role

  const sign = useSignMessage({ accessToken, email, walletId })

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-medium">DFNS + Stellar Testnet</h1>
        </div>

        <p className="flex items-center gap-2 text-muted-foreground">
          Signed in as <code className="font-mono">{email}</code>
          {role && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
              {ROLE_LABELS[role]}
            </span>
          )}
        </p>

        <RolePanel role={role} />

        <WalletInfo
          isLoading={meQuery.isLoading}
          walletId={walletId}
          walletAddress={walletAddress}
        />

        <SignMessageForm
          onSign={sign.sign}
          isPending={sign.isPending}
          signature={sign.signature}
          statusMsg={sign.statusMsg}
          walletId={walletId}
        />

        {/* Role-specific RWA list */}
        {role && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-medium">
              {role === "SHIPPING_COMPANY"
                ? "My collateral"
                : "Available offerings"}
            </h2>
            <RwaList
              variant={role === "SHIPPING_COMPANY" ? "shipper" : "investor"}
            />
          </div>
        )}
      </div>
    </div>
  )
}
