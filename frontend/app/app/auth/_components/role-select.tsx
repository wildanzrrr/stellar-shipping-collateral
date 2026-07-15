"use client"

import { Button } from "@/components/ui/button"
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
      <span className="text-xs leading-none text-muted-foreground select-none">
        I am a…
      </span>
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map((role) => (
          <Button
            key={role}
            type="button"
            variant={value === role ? "default" : "outline"}
            onClick={() => onChange(role)}
            aria-pressed={value === role}
          >
            {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>
    </div>
  )
}
