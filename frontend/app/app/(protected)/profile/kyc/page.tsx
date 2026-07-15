"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle,
  SpinnerGap,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react"
import SumsubWebSdk from "@sumsub/websdk-react"
import { useSession } from "next-auth/react"

import {
  authApi,
  KYC_STATUS_LABELS,
  sumsubApi,
  type KycStatus,
  type QuestionnaireAnswers,
  type UserRole,
} from "@/lib/api"

import {
  InvestmentQuestionnaire,
  QuestionnaireComplete,
} from "./_components/investment-questionnaire"

type Phase = "questionnaire" | "transition" | "verification"

/**
 * KYC verification page.
 *
 * Two-phase flow:
 * 1. Investment profile questionnaire — 5 simple questions to build the
 *    user's investor profile and confirm their understanding of the platform
 *    and collateral model. No wrong answers; purely for profiling.
 * 2. Sumsub WebSDK — document upload + liveness check. Completion/rejection
 *    is delivered via webhook to the BE, which updates `kycStatus`. This page
 *    reacts to the SDK's status-change events for immediate UI feedback.
 */
export default function KycPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const [phase, setPhase] = useState<Phase>("questionnaire")
  const [submitting, setSubmitting] = useState(false)

  // Current KYC status from the BE — refreshed when the SDK reports a change.
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const kycStatus: KycStatus =
    meQuery.data?.kycStatus ?? session?.user?.kycStatus ?? "NOT_STARTED"

  const role: UserRole | undefined = meQuery.data?.role ?? session?.user?.role

  // Shipping companies skip KYC — redirect them to KYB.
  useEffect(() => {
    if (role === "SHIPPING_COMPANY") {
      router.replace("/app/profile/kyb")
    }
  }, [role, router])

  // Access token for the Sumsub WebSDK — only fetched when we reach the
  // verification phase to avoid generating a token before the questionnaire
  // is complete.
  const tokenQuery = useQuery({
    queryKey: ["sumsub-token"],
    queryFn: () => sumsubApi.getAccessToken(accessToken),
    enabled: Boolean(accessToken) && phase === "verification",
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const [polling, setPolling] = useState(false)

  // After the SDK signals a status change, poll the BE a few times so the
  // local `me` cache catches the webhook-driven DB update.
  const refreshStatus = useCallback(() => {
    setPolling(true)
    let attempts = 0
    const interval = setInterval(async () => {
      attempts += 1
      await meQuery.refetch()
      if (attempts >= 6) {
        clearInterval(interval)
        setPolling(false)
      }
    }, 5_000)
  }, [meQuery])

  // Already verified — show success state (skip questionnaire).
  if (kycStatus === "COMPLETED") {
    return (
      <StatusState
        icon={<CheckCircle size={32} className="text-emerald-600" />}
        title="You're verified"
        subtitle="Your identity has been confirmed. You now have full access to the app."
        action={{
          label: "Back to profile",
          onClick: () => router.push("/app/profile"),
        }}
      />
    )
  }

  // Shipping company being redirected to KYB — show a brief loading state.
  if (role === "SHIPPING_COMPANY") {
    return (
      <StatusState
        icon={<SpinnerGap size={32} className="animate-spin" />}
        title="Redirecting…"
        subtitle="Shipping companies go straight to business verification."
      />
    )
  }

  // Phase 1 — investment profile questionnaire.
  if (phase === "questionnaire") {
    return (
      <InvestmentQuestionnaire
        isSubmitting={submitting}
        onComplete={async (answers: QuestionnaireAnswers) => {
          setSubmitting(true)
          try {
            await authApi.submitQuestionnaire(accessToken, answers)
            // Invalidate the me query so profile data reflects the new answers.
            await meQuery.refetch()
          } catch {
            toast.error("Failed to save your profile. Please try again.")
            setSubmitting(false)
            return
          }
          // Brief transition so the user sees their profile was saved.
          setPhase("transition")
          setTimeout(() => {
            setSubmitting(false)
            setPhase("verification")
          }, 1500)
        }}
      />
    )
  }

  // Transition — brief "profile saved" state before Sumsub launches.
  if (phase === "transition") {
    return <QuestionnaireComplete />
  }

  // Phase 2 — Sumsub WebSDK verification.

  if (tokenQuery.isLoading) {
    return (
      <StatusState
        icon={<SpinnerGap size={32} className="animate-spin" />}
        title="Preparing verification…"
        subtitle="We're generating your secure verification session."
      />
    )
  }

  if (tokenQuery.isError) {
    return (
      <StatusState
        icon={<XCircle size={32} className="text-destructive" />}
        title="Could not start verification"
        subtitle={
          tokenQuery.error instanceof Error
            ? tokenQuery.error.message
            : "Please try again later."
        }
        action={{ label: "Retry", onClick: () => tokenQuery.refetch() }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/app/profile")}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to profile"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-medium">Identity Verification</h1>
          <p className="text-sm text-muted-foreground">
            Status: {KYC_STATUS_LABELS[kycStatus]}
            {polling && " · Waiting for update…"}
          </p>
        </div>
      </div>

      {kycStatus === "REJECTED" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <WarningCircle
            size={18}
            weight="bold"
            className="mt-0.5 shrink-0 text-destructive"
          />
          <p className="text-foreground/80">
            Your previous submission was rejected. Please review the
            requirements and submit again.
          </p>
        </div>
      )}

      {tokenQuery.data?.token && (
        <div className="rounded-lg border" style={{ minHeight: "85vh" }}>
          <SumsubWebSdk
            accessToken={tokenQuery.data.token}
            // Token expiration handler — fetches a fresh token from the BE.
            expirationHandler={async () => {
              const fresh = await sumsubApi.getAccessToken(accessToken)
              return fresh.token
            }}
            config={{ lang: "en" }}
            options={{ addViewportTag: false, adaptIframeHeight: true }}
            onMessage={(type: string, payload: unknown) => {
              // The applicant-status-changed and verification-completed
              // events indicate the BE webhook should soon update kycStatus.
              if (
                type === "idCheck.onApplicantStatusChanged" ||
                type === "idCheck.onApplicantVerificationCompleted" ||
                type === "idCheck.onApplicantSubmitted"
              ) {
                refreshStatus()
              }
            }}
            onError={(error: unknown) => {
              toast.error(
                error instanceof Error ? error.message : "Verification error"
              )
            }}
          />
        </div>
      )}
    </div>
  )
}

function StatusState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-6 text-center">
      <div className="flex size-12 items-center justify-center">{icon}</div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
