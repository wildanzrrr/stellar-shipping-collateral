"use client"

import type { Mode } from "./types"

const TABS: { value: Mode; label: string }[] = [
  { value: "login", label: "Sign in" },
  { value: "register", label: "Create account" },
]

export function ModeTabs({
  value,
  onChange,
}: {
  value: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <div className="flex rounded-lg border p-1 text-sm">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex-1 rounded-md px-3 py-1.5 ${
            value === tab.value
              ? "bg-muted font-medium"
              : "text-muted-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
