"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { UserRole } from "@/lib/api"
import { RoleSelect } from "./role-select"
import type { AuthFormValues, Mode } from "./types"

export function AuthForm({
  mode,
  busy,
  onSubmit,
}: {
  mode: Mode
  busy: boolean
  onSubmit: (values: AuthFormValues) => void
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<UserRole>("INVESTOR")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ email, role, firstName, lastName })
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoFocus
        />
      </div>

      {mode === "register" && (
        <>
          <RoleSelect value={role} onChange={setRole} />
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="firstName"
              >
                First name
              </label>
              <input
                id="firstName"
                autoComplete="given-name"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alice"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="lastName"
              >
                Last name
              </label>
              <input
                id="lastName"
                autoComplete="family-name"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>
        </>
      )}

      <Button type="submit" disabled={busy || !email.trim()}>
        {busy
          ? "Working…"
          : mode === "login"
            ? "Sign in with passkey"
            : "Create account"}
      </Button>
    </form>
  )
}
