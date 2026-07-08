"use client"

import Link from "next/link"

import { BunkrLogo } from "@/components/landing/logo"

/**
 * Brand link in the app navbar. Wraps the shared BunkrLogo wordmark.
 */
export function AppNavLogo() {
  return (
    <Link href="/app" className="flex items-center" aria-label="Bunkr home">
      <BunkrLogo />
    </Link>
  )
}
