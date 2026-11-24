import { siteConfig } from "@/lib/site-config"

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
        <p className="font-serif text-lg text-foreground">{siteConfig.name}</p>
        <p>{siteConfig.tagline}</p>
      </div>
    </footer>
  )
}
