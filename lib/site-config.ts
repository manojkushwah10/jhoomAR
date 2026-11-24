/** Public, non-secret settings. Safe to import from client components. */
export const siteConfig = {
  name: "JhoomAR",
  tagline: "See it hanging in your room before you buy.",
  /** Absolute base URL. Falls back to the Vercel production domain, then localhost. */
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, ""),
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919999999999",
  arWebXrExperimental: process.env.NEXT_PUBLIC_AR_WEBXR_EXPERIMENTAL === "true",
  locale: "en-IN",
  currency: "INR",
} as const
