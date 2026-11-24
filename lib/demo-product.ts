import { CEILING_PRESETS, DEFAULT_CEILING_ID, arFileName, type CeilingPresetId } from "@/lib/three-d/presets"

/**
 * M1 demo data. In M2 this is replaced by the database (Product + Model3D);
 * keep the shape close to what `GET /api/products/[slug]` will return.
 */
export type DemoProduct = {
  slug: string
  code: string
  name: string
  category: { slug: string; name: string }
  priceInr: number
  mrpInr?: number
  inStock: boolean
  shortDescription: string
  description: string[]
  dimensions: { diameterCm: number; heightCm: number; dropLengthCm: number }
  material: string
  finish: string
  finishes: string[]
  bulbs: { count: number; type: string }
  images: Array<{ src: string; alt: string; width: number; height: number }>
  model: {
    glbUrl: string
    posterUrl: string
    placement: "ceiling" | "wall" | "floor"
    defaultCeiling: CeilingPresetId
    ar: Array<{ id: CeilingPresetId; glb: string; usdz: string }>
  }
  seo: { title: string; description: string }
}

const base = "/models/demo-jhoomar"

export const demoProduct: DemoProduct = {
  slug: "demo-jhoomar",
  code: "JH-DEMO-08",
  name: "Aarohi 8-Arm Crystal Jhoomar",
  category: { slug: "jhoomar", name: "Jhoomars" },
  priceInr: 48500,
  mrpInr: 56000,
  inStock: true,
  shortDescription: "An antique-brass jhoomar with eight candle arms and two tiers of crystal drops — made for living rooms and double-height halls.",
  description: [
    "Aarohi brings the warm glow of a traditional jhoomar to modern homes. Eight curved arms hold candle-style lamps above a ring of hand-cut crystal drops, with a smaller crown of crystals near the top.",
    "It is 80 cm wide and 90 cm tall, and hangs on a 40 cm chain — a good fit over a dining table or in the middle of a living room with a 9–12 ft ceiling.",
  ],
  dimensions: { diameterCm: 80, heightCm: 90, dropLengthCm: 40 },
  material: "Brass-finish metal frame with K9 crystal drops",
  finish: "Antique brass",
  finishes: ["Antique brass", "Polished gold"],
  bulbs: { count: 8, type: "E14 candle LED, up to 6 W each (not included)" },
  images: [
    { src: `${base}/poster.webp`, alt: "Aarohi 8-arm crystal jhoomar in antique brass, front view", width: 1200, height: 1500 },
    { src: `${base}/gallery-below.webp`, alt: "Aarohi jhoomar seen from below, showing the crystal ring", width: 1200, height: 1500 },
    { src: `${base}/gallery-detail.webp`, alt: "Close-up of the brass stem, crown and candle arms", width: 1200, height: 1500 },
  ],
  model: {
    glbUrl: `${base}/web.glb`,
    posterUrl: `${base}/poster.webp`,
    placement: "ceiling",
    defaultCeiling: DEFAULT_CEILING_ID,
    ar: CEILING_PRESETS.map((p) => ({ id: p.id, glb: `${base}/${arFileName(p.id)}`, usdz: `${base}/${arFileName(p.id, "usdz")}` })),
  },
  seo: {
    title: "Aarohi 8-Arm Crystal Jhoomar — See It in Your Room",
    description: "80 cm antique-brass crystal jhoomar with 8 candle arms. Rotate it in 3D and see it hanging at real size in your room using your phone camera.",
  },
}

const products = [demoProduct]

export function getDemoProduct(slug: string): DemoProduct | undefined {
  return products.find((p) => p.slug === slug)
}

export function listDemoProductSlugs(): string[] {
  return products.map((p) => p.slug)
}
