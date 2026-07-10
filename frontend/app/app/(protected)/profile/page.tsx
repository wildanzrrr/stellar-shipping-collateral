"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  ArrowRight,
  CircleNotch,
  IdentificationCard,
  Sparkle,
  Wallet,
} from "@phosphor-icons/react"

import {
  authApi,
  KYC_STATUS_LABELS,
  ROLE_LABELS,
  type KycStatus,
  type QuestionnaireAnswers,
  type UserRole,
} from "@/lib/api"

import { QUESTIONS } from "./kyc/_components/questionnaire-data"

/** Map raw answer values to human-readable labels from the questionnaire. */
function answerLabels(questionId: string, raw: string | string[]): string[] {
  const question = QUESTIONS.find((q) => q.id === questionId)
  if (!question) return Array.isArray(raw) ? raw : [raw]
  const values = Array.isArray(raw) ? raw : [raw]
  return values.map(
    (v) => question.options.find((o) => o.value === v)?.label ?? v
  )
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken ?? ""

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(accessToken),
    enabled: Boolean(accessToken),
  })

  const role: UserRole | undefined = meQuery.data?.role ?? session?.user?.role
  const kycStatus: KycStatus | undefined =
    meQuery.data?.kycStatus ?? session?.user?.kycStatus
  const profile: QuestionnaireAnswers | null | undefined =
    meQuery.data?.investmentProfile ?? null

  const fullName =
    [session?.user?.firstName, session?.user?.lastName]
      .filter(Boolean)
      .join(" ") || "—"

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="max-w-2xl">
        <h1 className="text-lg font-medium">Profile</h1>

        {/* Account card */}
        <div className="mt-4 flex flex-col gap-0">
          <div className="flex items-center gap-2 border-b pb-3">
            <IdentificationCard size={18} className="text-muted-foreground" />
            <h2 className="text-sm font-medium">Account</h2>
          </div>

          <div className="mt-3 flex flex-col gap-3 text-sm">
            <ProfileRow
              label="Email"
              value={session?.user?.email ?? "—"}
              mono
            />
            <ProfileRow label="Name" value={fullName} />
            <ProfileRow
              label="Role"
              value={role ? ROLE_LABELS[role] : "—"}
              badge
            />
            <ProfileRow
              label="Wallet address"
              value={meQuery.data?.walletAddress ?? "—"}
              mono
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">KYC status</span>
              <div className="flex items-center gap-2">
                {kycStatus && <KycBadge status={kycStatus} />}
                {kycStatus !== "COMPLETED" && (
                  <Link
                    href="/app/profile/kyc"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Verify now →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Investment profile card */}
        <div className="mt-6 flex flex-col gap-0">
          <div className="flex items-center gap-2 border-b pb-3">
            <Sparkle size={18} className="text-muted-foreground" />
            <h2 className="text-sm font-medium">Investment Profile</h2>
          </div>

          {meQuery.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CircleNotch size={14} className="animate-spin" />
              Loading…
            </div>
          ) : profile && Object.keys(profile).length > 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              {QUESTIONS.map((q) => {
                const raw = profile[q.id]
                if (!raw) return null
                const labels = answerLabels(q.id, raw)
                return (
                  <div
                    key={q.id}
                    className="flex flex-col gap-1.5 rounded-lg border p-3"
                  >
                    <span className="text-xs text-muted-foreground">
                      {q.title}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
              <Link
                href="/app/profile/kyc"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Retake questionnaire
                <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Complete the investment questionnaire before KYC verification to
                help us build your investor profile.
              </p>
              <Link
                href="/app/profile/kyc"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Start questionnaire →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string
  value: string
  mono?: boolean
  badge?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
          {value}
        </span>
      ) : (
        <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
      )}
    </div>
  )
}

function KycBadge({ status }: { status: KycStatus }) {
  return (
    <span
      className={[
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "COMPLETED"
          ? "border-emerald-500/30 bg-emerald-50 text-emerald-700"
          : status === "REJECTED" || status === "ON_HOLD"
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-border text-muted-foreground",
      ].join(" ")}
    >
      {KYC_STATUS_LABELS[status]}
    </span>
  )
}
