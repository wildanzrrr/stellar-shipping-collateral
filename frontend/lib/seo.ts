import type { Metadata } from "next"

/**
 * Reusable SEO pattern.
 *
 * One source of truth for site-wide defaults (`site`) and one factory
 * (`createMetadata`) every route reuses and overrides per page:
 *
 *   // server component page or segment layout
 *   export const metadata = createMetadata({
 *     title: "Dashboard",              // → "Dashboard — Bunkr"
 *     description: "…",
 *     path: "/dashboard",              // canonical + og:url
 *     noIndex: true,                   // robots override
 *     keywords: ["passkey wallet"],    // appended to site keywords
 *     image: { url: "/og-x.jpg", width: 1200, height: 630, alt: "…" },
 *   })
 *
 * Client components can't export metadata — give their segment a
 * `layout.tsx` and call the factory there (see app/dashboard/layout.tsx).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export const site = {
  name: "Bunkr",
  url: SITE_URL,
  defaultTitle: "Bunkr — Decentralized trade finance on Stellar",
  description:
    "Bunkr is a decentralized trade finance marketplace on Stellar. Shipping companies tokenize verified freight receivables for instant working capital; KYC-verified investors earn 2–9% yield from real-world shipping, settled in $USDC.",
  ogImage: {
    url: "/og.jpg",
    width: 1200,
    height: 630,
    alt: "Aerial view of a loaded container ship underway — Bunkr, freight invoice financing on Stellar",
  },
  keywords: [
    "decentralized trade finance",
    "trade finance marketplace",
    "maritime trade finance",
    "invoice financing",
    "freight receivables",
    "RWA tokenization",
    "Stellar",
    "Soroban",
    "SEP-57",
    "USDC",
    "working capital",
    "supply chain finance",
  ],
  locale: "en_US",
} as const

export type OgImage = {
  url: string
  width: number
  height: number
  alt: string
}

export type SeoInput = {
  /** Page title without the brand — the factory appends “ — Bunkr”. Omit for the homepage brand title. */
  title?: string
  description?: string
  /** Route path starting with “/” — becomes the canonical URL and og:url. */
  path?: `/${string}`
  /** Override the default OG/Twitter image. */
  image?: OgImage
  /** Appended to the site-wide keyword set. */
  keywords?: string[]
  /** Robots noindex,nofollow for utility/auth-ish surfaces. */
  noIndex?: boolean
  ogType?: "website" | "article"
}

export function createMetadata(input: SeoInput = {}): Metadata {
  const title = input.title
    ? `${input.title} — ${site.name}`
    : site.defaultTitle
  const description = input.description ?? site.description
  const path = input.path ?? "/"
  const image = input.image ?? site.ogImage

  return {
    metadataBase: new URL(site.url),
    title,
    description,
    applicationName: site.name,
    keywords: [...site.keywords, ...(input.keywords ?? [])],
    alternates: { canonical: path },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: input.ogType ?? "website",
      siteName: site.name,
      locale: site.locale,
      url: path,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  }
}

/** Organization + WebSite structured data — rendered once in the root layout. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: site.name,
        url: site.url,
        description: site.description,
      },
      {
        "@type": "WebSite",
        name: site.name,
        url: site.url,
      },
    ],
  }
}
