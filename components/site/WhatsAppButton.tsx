"use client"

import { MessageCircle } from "lucide-react"
import { track } from "@/lib/analytics-client"

export function WhatsAppButton({ href, label, productSlug }: { href: string; label: string; productSlug?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => track("whatsapp_click", { productSlug })}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-ink/80 px-6 text-base font-medium transition hover:bg-ink hover:text-ivory"
    >
      <MessageCircle aria-hidden className="size-5" />
      {label}
    </a>
  )
}
