"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
    <Tabs value={value} onValueChange={(v) => onChange(v as Mode)}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
