import type { MetadataRoute } from "next"

import { site } from "@/lib/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  // Indexable routes only — noIndex surfaces (e.g. /dashboard) stay out.
  return [
    {
      url: `${site.url}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ]
}
