import Link from "next/link"
import { siteConfig } from "@/lib/site-config"

export function SiteHeader() {
  return (
    <header className="border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          Jhoom<span className="text-brass-deep">AR</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-6 text-sm">
          <Link href="/products/demo-jhoomar" className="hover:text-brass-deep">
            Jhoomars
          </Link>
          <a href={`https://wa.me/${siteConfig.whatsappNumber}`} className="hidden hover:text-brass-deep sm:inline" rel="noopener">
            WhatsApp us
          </a>
        </nav>
      </div>
    </header>
  )
}
