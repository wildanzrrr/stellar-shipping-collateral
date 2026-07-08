"use client"

import { ROLE_LABELS, type UserRole } from "@/lib/api"

const ROLES: UserRole[] = ["INVESTOR", "SHIPPING_COMPANY"]

export function RoleSelect({
  value,
  onChange,
}: {
  value: UserRole
  onChange: (role: UserRole) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">I am a…</span>
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            aria-pressed={value === role}
            className={`rounded-md border px-3 py-2 text-sm transition ${
              value === role
                ? "border-foreground bg-muted font-medium"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>
    </div>
  )
}
