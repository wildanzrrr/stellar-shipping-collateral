import { Suspense } from "react"

import { AuthPanel } from "./_components/auth-panel"

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPanel />
    </Suspense>
  )
}
