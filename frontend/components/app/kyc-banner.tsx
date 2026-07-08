"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { X } from "@phosphor-icons/react"
import { useSession } from "next-auth/react"

import { authApi, KYC_STATUS_LABELS, type KycStatus } from "@/lib/api"

/**
 * Non-intrusive banner shown below the navbar when the signed-in user has not
 * completed KYC. Clicking "Verify now" routes to `/app/profile/kyc`.
 *
 * The banner auto-hides once the backend reports `COMPLETED`. It also respects
 * a per-user dismiss preference so already-rejected or on-hold users can close
 * the persistent copy without losing the status itself.
 */
export function KycBanner() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const kycStatus: KycStatus =
    meQuery.data?.kycStatus ?? session?.user?.kycStatus ?? "NOT_STARTED"

  const storageKey = `kyc-banner-dismissed:${session?.user?.id ?? "anon"}`

  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (kycStatus === "COMPLETED") {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
      return
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1")
    } catch {
      // ignore
    }
  }, [kycStatus, storageKey])

  if (kycStatus === "COMPLETED" || dismissed) return null

  const isBlocking = kycStatus === "NOT_STARTED" || kycStatus === "INIT"
  const isNegative = kycStatus === "REJECTED" || kycStatus === "ON_HOLD"

  return (
    <div
      className={[
        "border-b",
        isBlocking
          ? "border-amber-500/30 bg-amber-50"
          : isNegative
            ? "border-destructive/30 bg-destructive/5"
            : "border-blue-500/30 bg-blue-50",
      ].join(" ")}
    >
      <div
        className="mx-auto flex items-center gap-3 px-[var(--bk-gutter)] py-2.5 text-sm"
        style={{ maxWidth: "var(--bk-page-max)" }}
      >
        <span
          className={[
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            isBlocking
              ? "bg-amber-500 text-white"
              : isNegative
                ? "bg-destructive text-white"
                : "bg-blue-500 text-white",
          ].join(" ")}
          aria-hidden
        >
          !
        </span>
        <p className="flex-1 text-foreground/80">
          {isBlocking ? (
            <>
              Complete your KYC to get full access to the app. Current status:{" "}
              <span className="font-medium text-foreground">
                {KYC_STATUS_LABELS[kycStatus]}
              </span>
              .
            </>
          ) : isNegative ? (
            <>
              Your KYC verification was not approved (
              {KYC_STATUS_LABELS[kycStatus]}). You can retry to submit new
              documents.
            </>
          ) : (
            <>
              Your KYC is under review ({KYC_STATUS_LABELS[kycStatus]}). Full
              access unlocks once verification completes.
            </>
          )}
        </p>
        <Link
          href="/app/profile/kyc"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          {isNegative ? "Retry verification" : "Verify now"}
        </Link>
        <button
          type="button"
          aria-label="Dismiss KYC banner"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => {
            try {
              window.localStorage.setItem(storageKey, "1")
            } catch {
              // ignore
            }
            setDismissed(true)
          }}
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  )
}
