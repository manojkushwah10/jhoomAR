"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Box, X } from "lucide-react"
import { track } from "@/lib/analytics-client"
import { t } from "@/lib/i18n"
import { siteConfig } from "@/lib/site-config"
import { CEILING_PRESETS, DEFAULT_CEILING_ID, type CeilingPresetId } from "@/lib/three-d/presets"
import type { ModelViewerElement } from "@/types/model-viewer"
import { NO_AR_FALLBACK_HASH, detectArPlatform, webXrArSupported, type ArPlatform } from "./ar-support"
import { attachArOverlay } from "./ar-overlay"
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

type Role = "handoff" | "webxr"
const HIDDEN = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"
const FULLSCREEN = "position:fixed;inset:0;width:100%;height:100%;z-index:60"

/**
 * "View in your room" for hanging lights.
 *  1. Tap the button → choose ceiling height (9/10/11/12 ft).
 *  2. "Open camera" hands the pre-built hanging model to Google's Scene Viewer (Android) or
 *     AR Quick Look (iPhone). It opens at real size; drag moves it, twist turns it, pinch zooms
 *     (all three viewers snap back to 100% near real size).
 *  3. Android: if Chrome can run AR itself (WebXR), "Open camera" opens it directly in one tap and Google's
 *     Scene Viewer is a secondary link. Otherwise Scene Viewer; if that shows nothing (app missing, opens and
 *     closes, or Chrome falls back), say what to install.
 * Add ?ardebug=1 to the URL to see a diagnostics panel (for phone testing).
 */
export function ARButton({ productSlug, productName, productUrl, variants, defaultCeiling = DEFAULT_CEILING_ID, placement = "floor" }: Props) {
  const [platform, setPlatform] = useState<ArPlatform | null>(null)
  const [xr, setXr] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [ceiling, setCeiling] = useState<CeilingPresetId>(defaultCeiling)
  const [unsupported, setUnsupported] = useState<null | "unsupported" | "sceneViewerFailed">(null)
  /** An Android hand-off to Scene Viewer was tried and the visitor is back on the page. */
  const [attempted, setAttempted] = useState(false)
  const [insecure, setInsecure] = useState(false)
  const [ready, setReady] = useState(false)
  const [debug, setDebug] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [caps, setCaps] = useState("-")
  const els = useRef<Partial<Record<Role, ModelViewerElement>>>({})
  const holder = useRef<HTMLDivElement>(null)
  const t0 = useRef(0)
  const ceilingRef = useRef<CeilingPresetId>(defaultCeiling)
  useEffect(() => {
    ceilingRef.current = ceiling
  }, [ceiling])

  const note = useCallback((msg: string) => {
    const ms = t0.current ? `+${Date.now() - t0.current}ms ` : ""
    setLog((l) => [...l.slice(-30), `${ms}${msg}`])
  }, [])

  useEffect(() => {
    // Client-only capability checks (no SSR/hydration mismatch: first render is the same).
    const p = detectArPlatform()
    const params = new URLSearchParams(window.location.search)
    const fellBack = window.location.hash === NO_AR_FALLBACK_HASH
    queueMicrotask(() => {
      setPlatform(p)
      setDebug(params.get("ardebug") === "1")
      if (fellBack) setAttempted(true)
      // Scene Viewer (a separate Android app) refuses to download models over plain http,
      // e.g. when testing the dev server on http://192.168.x.x from a phone.
      if (p === "scene-viewer" && !window.isSecureContext) setInsecure(true)
      // Arrived by scanning the desktop QR code → open the ceiling picker straight away.
      if (p !== "none" && params.get("ar") === "1") setOpen(true)
    })
    if (p === "scene-viewer") void webXrArSupported().then(setXr)
  }, [])

  // After a failed Android attempt with no in-browser AR either: tell the visitor what to install.
  useEffect(() => {
    if (attempted && xr === false) queueMicrotask(() => setUnsupported("sceneViewerFailed"))
  }, [attempted, xr])

  // Chrome couldn't hand over to Google's app → it jumps to #model-viewer-no-ar-fallback (model-viewer goes back).
  useEffect(() => {
    if (platform !== "scene-viewer") return
    const onHash = () => {
      if (window.location.hash !== NO_AR_FALLBACK_HASH) return
      note("Chrome used the fallback URL (Google AR app could not be opened)")
      track("ar_open", { productSlug, result: "scene_viewer_fallback" })
      setAttempted(true)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [platform, productSlug, note])

  const variant = variants.find((v) => v.id === ceiling) ?? variants[0]

  /** One hidden <model-viewer> per AR route: "handoff" (Scene Viewer / Quick Look) and, if supported, "webxr". */
  const ensureElements = useCallback(async () => {
    await loadModelViewer()
    if (!holder.current) return
    const roles: Role[] = ["handoff"]
    if (platform === "scene-viewer" && (xr || siteConfig.arWebXrExperimental)) roles.push("webxr")
    for (const role of roles) {
      if (els.current[role]) continue
      const el = document.createElement("model-viewer") as ModelViewerElement
      el.dataset.arRole = role
      el.setAttribute("ar", "")
      el.setAttribute("ar-modes", role === "webxr" ? "webxr" : "scene-viewer quick-look")
      // Pinch-to-zoom allowed; every AR viewer opens at real size and snaps back to 100% near it.
      el.setAttribute("ar-scale", "auto")
      el.setAttribute("ar-placement", placement)
      // The WebXR element must already have the model loaded so the session starts within the tap.
      el.setAttribute("loading", role === "webxr" ? "eager" : "lazy")
      el.setAttribute("alt", productName)
      el.setAttribute("aria-hidden", "true")
      el.style.cssText = HIDDEN
      const noArButton = document.createElement("span")
      noArButton.slot = "ar-button"
      noArButton.style.display = "none"
      if (role === "handoff") el.appendChild(noArButton)
      if (role === "webxr") {
        // Proper camera layout over in-Chrome AR: title, ceiling chip, floor prompt, size readout, − / Real size / +.
        attachArOverlay(el, () => ({
          title: productName,
          ceilingLabel: CEILING_PRESETS.find((p) => p.id === ceilingRef.current)?.label ?? "",
        }))
      }
      el.addEventListener("ar-status", (e) => {
        const status = (e as CustomEvent<{ status: string }>).detail.status
        note(`${role}: ar-status ${status}`)
        // In-browser AR draws model-viewer's own controls over the camera: show the element meanwhile.
        if (status === "session-started") {
          el.removeAttribute("aria-hidden")
          el.style.cssText = FULLSCREEN
        } else if (status === "not-presenting") {
          el.setAttribute("aria-hidden", "true")
          el.style.cssText = HIDDEN
        } else if (status === "failed") {
          if (role === "handoff" && platform === "scene-viewer") {
            // Scene Viewer is now blocked for this page: offer in-Chrome AR, or say what to install.
            setAttempted(true)
          } else {
            setUnsupported((current) => current ?? "unsupported")
          }
        }
      })
      el.addEventListener("load", () => note(`${role}: model loaded`))
      el.addEventListener("error", (e) => note(`${role}: error ${JSON.stringify((e as unknown as CustomEvent).detail ?? "")}`))
      holder.current.appendChild(el)
      els.current[role] = el
    }
  }, [platform, xr, placement, productName, note])

  // Keep the hidden elements pointed at the chosen ceiling height (before the user taps).
  useEffect(() => {
    if (!open) return
    // Android: wait for the WebXR check, so the first tap already goes to the right camera.
    if (platform === "scene-viewer" && xr === null) return
    let cancelled = false
    void ensureElements().then(() => {
      if (cancelled || !variant) return
      // Scene Viewer reads title/link from the model URL's query string.
      const glb = new URL(variant.glb, window.location.href)
      const here = new URL(window.location.href)
      here.search = ""
      here.hash = ""
      glb.searchParams.set("title", productName)
      glb.searchParams.set("link", here.protocol === "https:" ? here.toString() : productUrl)
      for (const el of Object.values(els.current)) {
        el.setAttribute("src", glb.toString())
        el.setAttribute("ios-src", variant.usdz)
      }
      // Give model-viewer one update cycle to pick the AR mode for the new source.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (cancelled) return
          setReady(true)
          const { handoff, webxr } = els.current
          setCaps(`handoff=${String(handoff?.canActivateAR)} webxr=${String(webxr?.canActivateAR)}`)
        }),
      )
    })
    return () => {
      cancelled = true
      setReady(false)
    }
  }, [open, variant, ensureElements, productName, productUrl, platform, xr])

  /** Android: notice when the Scene Viewer hand-off didn't show anything, however it failed. */
  function watchHandoff() {
    let wentAway = false
    const finish = (why: string) => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.clearTimeout(timer)
      note(why)
      setAttempted(true)
    }
    const onVisibility = () => {
      note(`page ${document.visibilityState}`)
      if (document.hidden) wentAway = true
      else if (wentAway) finish("back on the page")
    }
    const timer = window.setTimeout(() => {
      if (!wentAway) finish("no app opened within 3 s")
    }, 3000)
    document.addEventListener("visibilitychange", onVisibility)
  }

  async function launch(role: Role) {
    const el = els.current[role]
    t0.current = Date.now()
    note(`tap → ${role} (canActivateAR=${el?.canActivateAR})`)
    if (!el) return
    if (!el.canActivateAR) {
      setUnsupported(role === "handoff" && platform === "scene-viewer" ? "sceneViewerFailed" : "unsupported")
      return
    }
    setUnsupported(null)
    track("ar_open", { productSlug, ceiling, platform, mode: role === "webxr" ? "webxr" : platform })
    if (role === "handoff" && platform === "scene-viewer") watchHandoff()
    try {
      await el.activateAR()
    } catch (err) {
      note(`activateAR threw: ${err instanceof Error ? err.message : String(err)}`)
      setUnsupported("unsupported")
    }
  }

  if (platform === null || platform === "none") {
    return <div ref={holder} className="hidden" />
  }

  const canWebXr = platform === "scene-viewer" && xr === true
  // Where Chrome can run AR itself, "Open camera" opens it directly (one tap, no app switch);
  // Google's Scene Viewer stays available as a secondary link. Elsewhere: Scene Viewer / Quick Look.
  const primaryRole: Role = canWebXr ? "webxr" : "handoff"

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
      {unsupported && !open && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t.ar[unsupported]}
        </p>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="ar-sheet-title" className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="max-h-dvh w-full overflow-y-auto rounded-t-3xl bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-3xl">
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

            {attempted && canWebXr && !unsupported && (
              <p role="status" className="mt-5 rounded-xl border border-brass/40 bg-brass-soft p-3 text-sm">
                {t.ar.googleViewerFailed}
              </p>
            )}

            {insecure && (
              <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {t.ar.needsHttps}
              </p>
            )}

            <button
              type="button"
              onClick={() => launch(primaryRole)}
              disabled={!ready}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-ivory disabled:opacity-60"
            >
              <Box aria-hidden className="size-5" />
              {ready ? t.ar.open : t.viewer.loading}
            </button>
            {canWebXr && (
              <button type="button" onClick={() => launch("handoff")} disabled={!ready} className="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-60">
                {t.ar.orGoogleViewer}
              </button>
            )}
            {unsupported && (
              <p role="status" className="mt-3 text-sm text-destructive">
                {t.ar[unsupported]}
              </p>
            )}

            {debug && (
              <pre data-testid="ar-debug" className="mt-4 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-snug whitespace-pre-wrap">
                {[
                  `platform: ${platform} · secure: ${String(typeof window !== "undefined" && window.isSecureContext)}`,
                  `webxr immersive-ar: ${String(xr)}`,
                  `canActivateAR: ${caps}`,
                  `attempted: ${attempted} · message: ${unsupported ?? "-"}`,
                  `ua: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
                  "— events —",
                  ...log,
                ].join("\n")}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
