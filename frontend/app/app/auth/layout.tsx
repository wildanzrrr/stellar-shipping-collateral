import type { Metadata } from "next"

import { createMetadata } from "@/lib/seo"

export const metadata: Metadata = createMetadata({
  title: "Sign in",
  description:
    "Sign in or create your account with a passkey — email + WebAuthn, no password.",
  path: "/app/auth",
  noIndex: true,
})

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
