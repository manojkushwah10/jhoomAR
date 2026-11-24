import QRCode from "qrcode"
import { t } from "@/lib/i18n"

/**
 * Desktop helper: QR code that opens this product on a phone with the AR picker ready (?ar=1).
 * Server component — the SVG is generated at build/render time, no client JS.
 */
export async function QRCodeAR({ url, className = "" }: { url: string; className?: string }) {
  const target = new URL(url)
  target.searchParams.set("ar", "1")
  const svg = await QRCode.toString(target.toString(), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#2a241d", light: "#00000000" },
  })
  return (
    <div className={`flex items-center gap-5 rounded-2xl border bg-card p-5 ${className}`}>
      <div
        role="img"
        aria-label={`QR code linking to ${target.toString()}`}
        className="size-28 shrink-0 [&_svg]:size-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div>
        <p className="font-serif text-xl">{t.ar.qrTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.ar.qrHelp}</p>
      </div>
    </div>
  )
}
