"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  SpinnerGap,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { QuestionnaireAnswers } from "@/lib/api"

import {
  QUESTIONS as QUESTIONS_DEFAULT,
  type Question,
} from "./questionnaire-data"

interface InvestmentQuestionnaireProps {
  onComplete: (answers: QuestionnaireAnswers) => void
  isSubmitting?: boolean
  questions?: Question[]
  ctaLabel?: string
}

/**
 * Multi-step investment profile questionnaire.
 * Presented before KYC verification to build the user's investor profile
 * and confirm their understanding of the platform and collateral model.
 * Five questions, each with selectable options (single or multi-select).
 * No wrong answers — purely for profiling.
 */
export function InvestmentQuestionnaire({
  onComplete,
  isSubmitting = false,
  questions = QUESTIONS_DEFAULT,
  ctaLabel = "Continue to KYC",
}: InvestmentQuestionnaireProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({})

  const question = questions[step]
  const isLast = step === questions.length - 1
  const isFirst = step === 0

  const selected = answers[question.id]
  const selectedArr = Array.isArray(selected) ? selected : []
  const isSelected =
    question.kind === "multi" ? selectedArr.length > 0 : Boolean(selected)
  const meetsMin =
    question.kind === "multi"
      ? selectedArr.length >= (question.minSelected ?? 1)
      : Boolean(selected)

  const toggleOption = (q: Question, value: string) => {
    if (q.kind === "single") {
      setAnswers((prev) => ({ ...prev, [q.id]: value }))
    } else {
      setAnswers((prev) => {
        const current = Array.isArray(prev[q.id])
          ? (prev[q.id] as string[])
          : []
        const exists = current.includes(value)
        const next = exists
          ? current.filter((v) => v !== value)
          : [...current, value]
        return { ...prev, [q.id]: next }
      })
    }
  }

  const handleNext = () => {
    if (!meetsMin) {
      toast.error("Please select at least one option to continue.")
      return
    }
    if (isLast) {
      onComplete(answers)
      return
    }
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (isFirst) {
      router.push("/app/profile")
      return
    }
    setStep((s) => s - 1)
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center py-6">
      <div className="w-full max-w-lg">
        {/* Back */}
        <button
          type="button"
          onClick={handleBack}
          className="mb-6 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {isFirst ? "Cancel" : "Back"}
        </button>

        {/* Progress */}
        <div className="mb-8 flex items-center gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        <p className="mb-6 text-xs font-medium text-muted-foreground">
          Step {step + 1} of {questions.length}
        </p>

        {/* Question */}
        <div className="mb-6">
          <h1 className="text-lg font-medium">{question.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {question.subtitle}
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-2">
          {question.options.map((opt) => {
            const active =
              question.kind === "single"
                ? selected === opt.value
                : selectedArr.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleOption(question, opt.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-muted ring-1 ring-primary"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-all",
                    question.kind === "single" ? "rounded-full" : "rounded-md",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background"
                  )}
                >
                  {active && <Check size={14} weight="bold" />}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {question.kind === "multi"
              ? `Select ${question.minSelected ?? 1} or more`
              : "Select one"}
          </span>
          <Button
            type="button"
            disabled={!meetsMin || isSubmitting}
            onClick={handleNext}
          >
            {isSubmitting ? (
              <>
                <SpinnerGap size={16} className="animate-spin" />
                Saving…
              </>
            ) : isLast ? (
              <>
                {ctaLabel}
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                Next
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Completion state shown briefly after the questionnaire is submitted,
 * before transitioning to the Sumsub WebSDK.
 */
export function QuestionnaireComplete({
  message = "Your investment profile has been recorded. Starting identity verification…",
}: {
  message?: string
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle size={28} className="text-emerald-600" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Profile saved</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
