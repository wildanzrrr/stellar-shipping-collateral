import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "Profile",
  description: "View your Bunkr account details, role, and wallet address.",
  path: "/app/profile",
  noIndex: true,
})

export default function ProfileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
