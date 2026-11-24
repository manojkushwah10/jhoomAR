import { describe, expect, it } from "vitest"
import { formatCm, formatInr } from "@/lib/format"
import { jsonLd, productJsonLd } from "@/lib/seo"
import { demoProduct } from "@/lib/demo-product"
import { productEnquiryMessage, whatsappLink } from "@/lib/whatsapp"
import { assertSafeKey } from "@/lib/storage/types"

describe("whatsapp", () => {
  it("builds a wa.me link with an encoded, pre-filled message", () => {
    const msg = productEnquiryMessage({ name: "Aarohi", code: "JH-1", url: "https://x.test/p" })
    const link = whatsappLink("+91 98765-43210", msg)
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true)
    expect(decodeURIComponent(link.split("text=")[1])).toBe(msg)
    expect(msg).toContain("JH-1")
  })
})

describe("format", () => {
  it("formats rupees and centimetres", () => {
    expect(formatInr(48500)).toBe("₹48,500")
    expect(formatCm(80)).toBe("80 cm (2 ft 7 in)")
    expect(formatCm(10)).toBe("10 cm (4 in)")
  })
})

describe("seo", () => {
  it("escapes < in JSON-LD so it can't close the script tag", () => {
    expect(jsonLd({ a: "</script><script>" })).not.toContain("</script>")
  })
  it("product JSON-LD has an INR offer and images", () => {
    const ld = productJsonLd(demoProduct)
    expect(ld.offers.priceCurrency).toBe("INR")
    expect(ld.offers.price).toBe(demoProduct.priceInr)
    expect(ld.image.length).toBeGreaterThan(0)
  })
})

describe("storage keys", () => {
  it("accepts normal keys and rejects traversal", () => {
    expect(assertSafeKey("models/abc/web.glb")).toBe("models/abc/web.glb")
    expect(() => assertSafeKey("../.env.local")).toThrow()
    expect(() => assertSafeKey("/etc/passwd")).toThrow()
    expect(() => assertSafeKey("models/../../x")).toThrow()
  })
})
