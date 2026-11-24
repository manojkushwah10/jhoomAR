import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ARButton } from "@/components/viewer/ARButton"
import { ModelViewer } from "@/components/viewer/ModelViewer"
import { QRCodeAR } from "@/components/viewer/QRCodeAR"
import { WhatsAppButton } from "@/components/site/WhatsAppButton"
import { getDemoProduct, listDemoProductSlugs } from "@/lib/demo-product"
import { formatCm, formatInr } from "@/lib/format"
import { t } from "@/lib/i18n"
import { absoluteUrl, breadcrumbJsonLd, jsonLd, productJsonLd } from "@/lib/seo"
import { siteConfig } from "@/lib/site-config"
import { productEnquiryMessage, whatsappLink } from "@/lib/whatsapp"

export async function generateStaticParams() {
  return listDemoProductSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = getDemoProduct((await params).slug)
  if (!product) return {}
  const path = `/products/${product.slug}`
  const image = { url: product.model.posterUrl, width: 1200, height: 1500, alt: product.images[0].alt }
  return {
    title: { absolute: `${product.seo.title} | ${siteConfig.name}` },
    description: product.seo.description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, title: product.seo.title, description: product.seo.description, images: [image] },
    twitter: { card: "summary_large_image", title: product.seo.title, description: product.seo.description, images: [image.url] },
  }
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = getDemoProduct((await params).slug)
  if (!product) notFound()

  const url = absoluteUrl(`/products/${product.slug}`)
  const { diameterCm, heightCm, dropLengthCm } = product.dimensions
  const whatsapp = whatsappLink(siteConfig.whatsappNumber, productEnquiryMessage({ name: product.name, code: product.code, url }))
  const specs: Array<[string, string]> = [
    [t.product.diameter, formatCm(diameterCm)],
    [t.product.height, formatCm(heightCm)],
    [t.product.drop, formatCm(dropLengthCm)],
    [t.product.totalHang, formatCm(heightCm + dropLengthCm)],
    [t.product.material, product.material],
    [t.product.finish, product.finishes.join(" · ")],
    [t.product.bulbs, `${product.bulbs.count} × ${product.bulbs.type}`],
    [t.product.code, product.code],
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: product.name, path: `/products/${product.slug}` },
          ])),
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
        <ol className="flex flex-wrap gap-1.5">
          <li><Link href="/" className="hover:text-foreground">Home</Link> /</li>
          <li>{product.category.name} /</li>
          <li aria-current="page" className="text-foreground">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <section aria-label="Photos and 3D view" className="lg:sticky lg:top-6 lg:self-start">
          <ModelViewer
            src={product.model.glbUrl}
            poster={product.model.posterUrl}
            alt={product.images[0].alt}
            productSlug={product.slug}
            priority
          />
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {product.images.map((img) => (
              <li key={img.src} className="overflow-hidden rounded-xl bg-[#f3ecdd]">
                <Image src={img.src} alt={img.alt} width={400} height={500} sizes="(min-width: 1024px) 16vw, 33vw" className="aspect-[4/5] w-full object-cover" />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="product-title">
          <p className="text-sm tracking-[0.18em] text-brass-deep uppercase">{product.category.name}</p>
          <h1 id="product-title" className="mt-2 text-4xl leading-tight sm:text-5xl">{product.name}</h1>
          <p className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-medium">{formatInr(product.priceInr)}</span>
            {product.mrpInr && <s className="text-muted-foreground">{formatInr(product.mrpInr)}</s>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t.product.demoNote}</p>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{product.shortDescription}</p>

          <div className="mt-8 space-y-3">
            {product.model.placement === "ceiling" && (
              <ARButton
                productSlug={product.slug}
                productName={product.name}
                productUrl={url}
                variants={product.model.ar}
                defaultCeiling={product.model.defaultCeiling}
              />
            )}
            <WhatsAppButton href={whatsapp} label={t.product.enquire} productSlug={product.slug} />
          </div>

          <QRCodeAR url={url} className="mt-6 hidden md:flex" />

          <h2 className="mt-12 text-2xl">{t.product.dimensions} &amp; details</h2>
          <dl className="mt-4 divide-y divide-border border-y">
            {specs.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-12 text-2xl">About this jhoomar</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
            {product.description.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>

          <h2 className="mt-12 text-2xl">How “View in your room” works</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1. Open this page on your phone</strong> — Chrome on Android or Safari on iPhone. No app needed.</li>
            <li><strong className="text-foreground">2. Pick your ceiling height</strong> — the jhoomar is placed so its top touches your ceiling.</li>
            <li><strong className="text-foreground">3. Point at the floor under the spot</strong> — a soft circle marks the floor; the jhoomar hangs above it at real size.</li>
          </ol>
        </section>
      </div>
    </main>
  )
}
