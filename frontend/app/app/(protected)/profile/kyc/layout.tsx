import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "KYC Verification",
  description: "Complete your identity verification to unlock full access.",
  path: "/app/profile/kyc",
  noIndex: true,
})

export default function KycLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
