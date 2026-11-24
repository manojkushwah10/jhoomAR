import type { MetadataRoute } from "next"
import { listDemoProductSlugs } from "@/lib/demo-product"
import { absoluteUrl } from "@/lib/seo"

/** M1: demo product only. M2/M4: generated from published products + categories in the DB. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    ...listDemoProductSlugs().map((slug) => ({ url: absoluteUrl(`/products/${slug}`), changeFrequency: "weekly" as const, priority: 0.8 })),
  ]
}
