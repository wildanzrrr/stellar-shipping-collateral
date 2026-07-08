"use client"

import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"

import { authApi, ROLE_LABELS, type UserRole } from "@/lib/api"

export default function ProfilePage() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const role: UserRole | undefined = meQuery.data?.role ?? session?.user?.role

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <h1 className="text-lg font-medium">Profile</h1>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono">{session?.user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>
              {session?.user?.firstName} {session?.user?.lastName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            {role && (
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {ROLE_LABELS[role]}
              </span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wallet address</span>
            <span className="font-mono text-xs">
              {meQuery.data?.walletAddress ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
