import Link from "next/link"

import { BunkrLogo } from "@/components/landing/logo"
import { Button } from "@/components/ui/button"
import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "Page not found",
  description:
    "The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.",
  path: "/404",
  noIndex: true,
})

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/" aria-label="Bunkr home">
        <BunkrLogo />
      </Link>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-mono text-5xl font-bold tracking-tight">404</p>
        <h1 className="text-lg font-medium">Page not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been
          moved.
        </p>
      </div>

      <Button asChild variant="outline">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  )
}
