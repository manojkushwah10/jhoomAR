"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Box, X } from "lucide-react"
import { track } from "@/lib/analytics-client"
import { t } from "@/lib/i18n"
import { siteConfig } from "@/lib/site-config"
import { CEILING_PRESETS, DEFAULT_CEILING_ID, type CeilingPresetId } from "@/lib/three-d/presets"
import type { ModelViewerElement } from "@/types/model-viewer"
import { NO_AR_FALLBACK_HASH, detectArPlatform, type ArPlatform } from "./ar-support"
import { loadModelViewer } from "./load-model-viewer"

export type ArVariant = { id: CeilingPresetId; glb: string; usdz: string }

type Props = {
  productSlug: string
  productName: string
  /** Absolute product page URL (shown as the "link" in Scene Viewer). */
  productUrl: string
  variants: ArVariant[]
  defaultCeiling?: CeilingPresetId
  placement?: "floor" | "wall"
}

/**
 * "View in your room" for hanging lights.
 *  1. Tap the button → choose ceiling height (9/10/11/12 ft).
 *  2. Tap "Open camera" → Scene Viewer (Android) or AR Quick Look (iPhone) opens with the
 *     pre-built hanging variant for that height, at fixed real size.
 * On devices without AR this renders nothing; the page shows a QR code instead (desktop).
 */
export function ARButton({ productSlug, productName, productUrl, variants, defaultCeiling = DEFAULT_CEILING_ID, placement = "floor" }: Props) {
  const [platform, setPlatform] = useState<ArPlatform | null>(null)
  const [open, setOpen] = useState(false)
  const [ceiling, setCeiling] = useState<CeilingPresetId>(defaultCeiling)
  const [unsupported, setUnsupported] = useState(false)
  const [ready, setReady] = useState(false)
  const mv = useRef<ModelViewerElement | null>(null)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Client-only capability check (no SSR/hydration mismatch: first render is the same).
    const p = detectArPlatform()
    const fellBack = window.location.hash === NO_AR_FALLBACK_HASH
    queueMicrotask(() => {
      setPlatform(p)
      if (fellBack) setUnsupported(true)
      // Arrived by scanning the desktop QR code → open the ceiling picker straight away.
      if (p !== "none" && new URLSearchParams(window.location.search).get("ar") === "1") setOpen(true)
    })
  }, [])

  const variant = variants.find((v) => v.id === ceiling) ?? variants[0]

  // Create one hidden <model-viewer> that only does the AR hand-off.
  const ensureElement = useCallback(async () => {
    await loadModelViewer()
    if (mv.current || !holder.current) return
    const el = document.createElement("model-viewer") as ModelViewerElement
    el.setAttribute("ar", "")
    el.setAttribute(
      "ar-modes",
      siteConfig.arWebXrExperimental ? "webxr scene-viewer quick-look" : "scene-viewer quick-look",
    )
    el.setAttribute("ar-scale", "fixed")
    el.setAttribute("ar-placement", placement)
    el.setAttribute("loading", "lazy")
    el.setAttribute("alt", productName)
    el.setAttribute("aria-hidden", "true")
    el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"
    el.addEventListener("ar-status", (e) => {
      if ((e as CustomEvent<{ status: string }>).detail.status === "failed") setUnsupported(true)
    })
    holder.current.appendChild(el)
    mv.current = el
  }, [placement, productName])

  // Keep the hidden element pointed at the chosen ceiling height (before the user taps "Open camera").
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void ensureElement().then(() => {
      const el = mv.current
      if (cancelled || !el || !variant) return
      // Scene Viewer reads title/link from the model URL's query string.
      const glb = new URL(variant.glb, window.location.href)
      glb.searchParams.set("title", productName)
      glb.searchParams.set("link", productUrl)
      el.setAttribute("src", glb.toString())
      el.setAttribute("ios-src", variant.usdz)
      // Give model-viewer one update cycle to pick the AR mode for the new source.
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setReady(true)))
    })
    return () => {
      cancelled = true
      setReady(false)
    }
  }, [open, variant, ensureElement, productName, productUrl])

  async function launch() {
    const el = mv.current
    if (!el) return
    if (!el.canActivateAR) {
      setUnsupported(true)
      return
    }
    track("ar_open", { productSlug, ceiling, platform })
    await el.activateAR()
  }

  if (platform === null || platform === "none") {
    return <div ref={holder} className="hidden" />
  }

  return (
    <div ref={holder} className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-ivory shadow-sm transition active:scale-[0.99]"
      >
        <Box aria-hidden className="size-5" />
        {t.ar.button}
      </button>
      {unsupported && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t.ar.unsupported}
        </p>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="ar-sheet-title" className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-3xl bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <h2 id="ar-sheet-title" className="text-2xl">
                {t.ar.sheetTitle}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.ar.cancel} className="-m-2 rounded-full p-2 text-muted-foreground">
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.ar.sheetHelp}</p>

            <fieldset className="mt-5 grid grid-cols-4 gap-2">
              <legend className="sr-only">{t.ar.sheetTitle}</legend>
              {CEILING_PRESETS.filter((p) => variants.some((v) => v.id === p.id)).map((p) => (
                <label
                  key={p.id}
                  className="flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl border text-sm has-checked:border-brass-deep has-checked:bg-brass-soft has-checked:font-semibold"
                >
                  <input type="radio" name="ceiling" value={p.id} checked={ceiling === p.id} onChange={() => setCeiling(p.id)} className="sr-only" />
                  <span>{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.metres.toFixed(2)} m</span>
                </label>
              ))}
            </fieldset>

            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>• {t.ar.hintFloor}</li>
              <li>• {t.ar.hintSize}</li>
              <li>• {t.ar.hintLight}</li>
            </ul>

            <button
              type="button"
              onClick={launch}
              disabled={!ready}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-ivory disabled:opacity-60"
            >
              <Box aria-hidden className="size-5" />
              {ready ? t.ar.open : t.viewer.loading}
            </button>
            {unsupported && (
              <p role="status" className="mt-3 text-sm text-destructive">
                {t.ar.unsupported}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
