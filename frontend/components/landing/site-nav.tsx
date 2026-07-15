"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { BunkrLogo } from "@/components/landing/logo"

// N1b canonical SaaS three-section · transparent-fixed → frost-on-scroll (design.md)
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24)
        raf = 0
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <header className={scrolled ? "bk-nav is-scrolled" : "bk-nav"}>
      <div className="bk-nav__inner">
        <Link href="/" className="bk-nav__brand">
          <BunkrLogo />
        </Link>
        <nav className="bk-nav__center" aria-label="Page sections">
          <a className="bk-nav__link" href="#lifecycle">
            How it works
          </a>
          <a className="bk-nav__link" href="#why">
            Marketplace
          </a>
          <a className="bk-nav__link" href="#recovery">
            Recovery
          </a>
          <a className="bk-nav__link" href="#compliance">
            Compliance
          </a>
          <a className="bk-nav__link" href="#reputation">
            Reputation
          </a>
        </nav>
        <div className="bk-nav__right">
          <Link href="/app" className="bk-btn bk-btn--fill">
            Open app
          </Link>
        </div>
      </div>
    </header>
  )
}
