"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { X } from "@phosphor-icons/react"
import { useSession } from "next-auth/react"

import { authApi, KYC_STATUS_LABELS, KYB_STATUS_LABELS, type KycStatus, type KybStatus, type UserRole } from "@/lib/api"

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

  const kybStatus: KybStatus =
    meQuery.data?.kybStatus ?? session?.user?.kybStatus ?? "NOT_STARTED"

  const role: UserRole | undefined =
    meQuery.data?.role ?? session?.user?.role

  // KYB is only relevant for shipping companies whose KYC is already done.
  const showKybBanner =
    role === "SHIPPING_COMPANY" && kycStatus === "COMPLETED" && kybStatus !== "COMPLETED"

  const storageKey = `kyc-banner-dismissed:${session?.user?.id ?? "anon"}`
  const kybStorageKey = `kyb-banner-dismissed:${session?.user?.id ?? "anon"}`

  const [dismissed, setDismissed] = useState(() => {
    if (kycStatus === "COMPLETED") return false
    try {
      return window.localStorage.getItem(`kyc-banner-dismissed:${session?.user?.id ?? "anon"}`) === "1"
    } catch {
      return false
    }
  })
  const [kybDismissed, setKybDismissed] = useState(() => {
    if (kybStatus === "COMPLETED" || !showKybBanner) return false
    try {
      return window.localStorage.getItem(`kyb-banner-dismissed:${session?.user?.id ?? "anon"}`) === "1"
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (kycStatus === "COMPLETED") {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    }

    if (kybStatus === "COMPLETED" || !showKybBanner) {
      try {
        window.localStorage.removeItem(kybStorageKey)
      } catch {
        // ignore
      }
    } else {
      // kybDismissed is initialized from localStorage in useState; no need
      // to re-set it here — the effect only cleans up when status changes.
    }
  }, [kycStatus, kybStatus, showKybBanner, storageKey, kybStorageKey])

  // KYC banner — only show when KYC is not completed and not dismissed.
  // When KYC is done but KYB is pending, show the KYB banner instead.
  if (kycStatus === "COMPLETED" && (!showKybBanner || kybDismissed)) return null

  // If KYC is done but KYB is needed, render the KYB banner.
  if (kycStatus === "COMPLETED" && showKybBanner) {
    const isBlocking =
      kybStatus === "NOT_STARTED" || kybStatus === "INIT"
    const isNegative = kybStatus === "REJECTED" || kybStatus === "ON_HOLD"

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
                Complete your business verification (KYB) to tokenize assets.
                Current status:{" "}
                <span className="font-medium text-foreground">
                  {KYB_STATUS_LABELS[kybStatus]}
                </span>
                .
              </>
            ) : isNegative ? (
              <>
                Your business verification was not approved (
                {KYB_STATUS_LABELS[kybStatus]}). You can retry to submit new
                documents.
              </>
            ) : (
              <>
                Your business verification is under review (
                {KYB_STATUS_LABELS[kybStatus]}). Asset tokenization unlocks once
                verification completes.
              </>
            )}
          </p>
          <Link
            href="/app/profile/kyb"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {isNegative ? "Retry verification" : "Verify now"}
          </Link>
          <button
            type="button"
            aria-label="Dismiss KYB banner"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => {
              try {
                window.localStorage.setItem(kybStorageKey, "1")
              } catch {
                // ignore
              }
              setKybDismissed(true)
            }}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>
    )
  }

  // --- KYC banner (original) ---

  if (dismissed) return null
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
