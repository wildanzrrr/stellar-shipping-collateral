import type { MetadataRoute } from "next"

import { site } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  return {
    // Crawl everything — noIndex surfaces (e.g. /dashboard) opt out via
    // meta robots from createMetadata, which crawlers can only honour
    // if the route stays crawlable here.
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site.url}/sitemap.xml`,
  }
}
