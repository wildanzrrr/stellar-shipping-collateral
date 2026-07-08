"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { UserRole } from "@/lib/api"

interface NavLink {
  href: string
  label: string
}

const INVESTOR_LINKS: NavLink[] = [
  { href: "/app", label: "My investment" },
  { href: "/app/collateral", label: "Available collateral" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/history", label: "History" },
]

const SHIPPING_LINKS: NavLink[] = [
  { href: "/app", label: "My collateral" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/history", label: "History" },
]

function linksFor(role: UserRole | undefined): NavLink[] {
  return role === "SHIPPING_COMPANY" ? SHIPPING_LINKS : INVESTOR_LINKS
}

interface AppNavMenuProps {
  role?: UserRole
}

/**
 * Role-gated page menu shown in the centre of the app navbar. The active
 * link is highlighted by matching the current pathname.
 */
export function AppNavMenu({ role }: AppNavMenuProps) {
  const pathname = usePathname()
  const links = linksFor(role)

  if (links.length === 0) return null

  return (
    <nav className="hidden items-center gap-1 sm:flex" aria-label="App pages">
      {links.map((l) => {
        const active =
          l.href === "/app"
            ? pathname === "/app"
            : pathname === l.href || pathname.startsWith(l.href + "/")
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              "rounded-md px-3 py-1.5 text-sm transition-colors " +
              (active
                ? "bg-muted font-bold text-foreground"
                : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground")
            }
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
