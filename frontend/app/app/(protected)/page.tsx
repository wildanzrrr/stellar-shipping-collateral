"use client"

import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"

import { authApi, ROLE_LABELS, type KybStatus, type UserRole } from "@/lib/api"

import { RolePanel } from "../_components/role-panel"
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

  const role: UserRole | undefined = meQuery.data?.role ?? session?.user?.role
  const kybStatus: KybStatus | undefined =
    meQuery.data?.kybStatus ?? session?.user?.kybStatus

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-4 text-sm">
        <RolePanel role={role} />

        {/* Role-specific RWA list — full width */}
        {role && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-medium">
              {role === "SHIPPING_COMPANY" ? "My collateral" : "My investment"}
            </h2>
            <RwaList
              variant={
                role === "SHIPPING_COMPANY" ? "shipper" : "my-investment"
              }
              kybStatus={kybStatus}
            />
          </div>
        )}
      </div>
    </div>
  )
}
