import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";
import { createMetadata, siteJsonLd } from "@/lib/seo"

// Locked system (design.md): Geist carries display + body, Geist Mono carries labels.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Site-wide defaults from the reusable SEO factory (lib/seo.ts);
// pages override per route via createMetadata({...}).
export const metadata: Metadata = createMetadata()

export const viewport: Viewport = {
  themeColor: [
    // approximations of --bk-paper (oklch 99%/15% at hue 130), see tokens.css
    { media: "(prefers-color-scheme: light)", color: "#fcfdfa" },
    { media: "(prefers-color-scheme: dark)", color: "#1f231e" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geistSans.variable)}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
