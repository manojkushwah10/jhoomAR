"use client"

export type AnalyticsEventName = "product_view" | "view_3d" | "ar_open" | "whatsapp_click" | "qr_shown"

/**
 * Fire-and-forget analytics. POST /api/events is built in M2; until then this only logs in dev.
 */
export function track(name: AnalyticsEventName, props: { productSlug?: string; [k: string]: unknown } = {}) {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") {
    if (process.env.NODE_ENV === "development") console.debug("[analytics]", name, props)
    return
  }
  const body = JSON.stringify({ name, ...props })
  if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } })
  }
}
