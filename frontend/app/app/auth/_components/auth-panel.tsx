"use client"

import { useState } from "react"

import { ModeTabs } from "./mode-tabs"
import { AuthForm } from "./auth-form"
import { useAuthFlow } from "./use-auth-flow"
import type { AuthFormValues, Mode } from "./types"

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login")
  const { status, busy, login, register, resetStatus } = useAuthFlow()

  function handleModeChange(next: Mode) {
    setMode(next)
    resetStatus()
  }

  function handleSubmit(values: AuthFormValues) {
    const email = values.email.trim()
    if (!email) return
    if (mode === "login") {
      login(email)
    } else {
      register({
        email,
        role: values.role,
        firstName: values.firstName.trim() || undefined,
        lastName: values.lastName.trim() || undefined,
      })
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-medium">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Use your email and passkey."
              : "Email + a passkey. No password."}
          </p>
        </div>

        <ModeTabs value={mode} onChange={handleModeChange} />

        <AuthForm mode={mode} busy={busy} onSubmit={handleSubmit} />

        {status && (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="auth-status__running text-xs text-muted-foreground">
              {status}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
