import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { demoProduct } from "@/lib/demo-product"
import { siteConfig } from "@/lib/site-config"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

/** M1 placeholder home page — the full home page (categories, testimonials…) is built in M4. */
export default function HomePage() {
  return (
    <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div>
        <p className="text-sm tracking-[0.18em] text-brass-deep uppercase">Jhoomars · Chandeliers · Pendants</p>
        <h1 className="mt-4 text-5xl leading-[1.05] sm:text-6xl">{siteConfig.tagline}</h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
          Rotate every jhoomar in 3D, then open your phone camera to see it hanging from your own ceiling — at real size, no app needed.
        </p>
        <Link
          href={`/products/${demoProduct.slug}`}
          className="mt-8 inline-flex h-14 items-center rounded-full bg-ink px-8 text-base font-medium text-ivory transition hover:bg-ink/90"
        >
          See the demo jhoomar
        </Link>
      </div>
      <Link href={`/products/${demoProduct.slug}`} className="block overflow-hidden rounded-3xl bg-[#f3ecdd]">
        <Image
          src={demoProduct.model.posterUrl}
          alt={demoProduct.images[0].alt}
          width={1200}
          height={1500}
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="aspect-[4/5] w-full object-cover"
        />
      </Link>
    </main>
  )
}
