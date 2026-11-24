import { siteConfig } from "@/lib/site-config"
import type { DemoProduct } from "@/lib/demo-product"

export const absoluteUrl = (path: string) => `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`

/** Serialize JSON-LD safely for a <script> tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl("/icon.svg"),
  }
}

export function productJsonLd(p: DemoProduct) {
  const url = absoluteUrl(`/products/${p.slug}`)
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.code,
    description: p.shortDescription,
    image: p.images.map((i) => absoluteUrl(i.src)),
    category: p.category.name,
    material: p.material,
    color: p.finish,
    width: { "@type": "QuantitativeValue", value: p.dimensions.diameterCm, unitCode: "CMT" },
    height: { "@type": "QuantitativeValue", value: p.dimensions.heightCm, unitCode: "CMT" },
    brand: { "@type": "Brand", name: siteConfig.name },
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: p.priceInr,
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}
