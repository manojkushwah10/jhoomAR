"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronsDown, ChevronsUp, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { track } from "@/lib/analytics-client"
import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"
import { loadModelViewer } from "./load-model-viewer"

type Props = {
  src: string
  poster: string
  alt: string
  productSlug: string
  /** Render the poster with high fetch priority (it's the LCP image on product pages). */
  priority?: boolean
}

const START = { orbit: "15deg 84deg auto", target: "auto auto auto", fov: "28deg" }
/** Camera height limits (degrees from straight above), same as min/max-camera-orbit below. */
const PHI_MIN = 10
const PHI_MAX = 170
/** One tap on "from above" / "from below" moves the camera this far. */
const PHI_STEP = 35

/** Next camera angle (degrees from straight above) after one "from above" (−1) or "from below" (+1) tap. */
export function nextCameraPhi(currentDeg: number, direction: -1 | 1): number {
  return Math.min(PHI_MAX, Math.max(PHI_MIN, currentDeg + direction * PHI_STEP))
}

/**
 * Interactive 3D viewer (Amazon-style): drag to rotate, pinch/scroll/buttons to zoom right into the
 * crystals, two-finger or right-drag to move, buttons to look from above / below, reset, and full screen.
 * (On phones an up/down swipe still scrolls the page, so the above/below buttons are how you tilt it there.)
 * Shows the poster image first (server-rendered, no layout shift), then swaps in <model-viewer> on the
 * visitor's first interaction (or a tap on "View in 3D").
 */
export function ModelViewer({ src, poster, alt, productSlug, priority = false }: Props) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  /** The 3D model is on screen: hide the poster underneath so it doesn't ghost through while rotating. */
  const [modelShown, setModelShown] = useState(false)
  const [touch, setTouch] = useState(true)
  const tracked = useRef(false)
  const loadNow = useRef<() => void>(() => {})
  const mv = useRef<ModelViewerElement | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const tiltGoal = useRef<{ phiDeg: number; at: number } | null>(null)

  // Load the 3D engine (~1 MB of JS) only after the visitor starts interacting with the page,
  // so it never competes with the first paint (LCP) or blocks the main thread for Lighthouse/SEO.
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => setTouch(window.matchMedia("(pointer: coarse)").matches))
    const events = ["pointerdown", "touchstart", "keydown", "wheel", "mousemove", "scroll"] as const
    const start = () => {
      events.forEach((e) => window.removeEventListener(e, start))
      loadModelViewer()
        .then(() => !cancelled && setReady(true))
        .catch(() => !cancelled && setFailed(true))
    }
    events.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }))
    loadNow.current = start
    return () => {
      cancelled = true
      events.forEach((e) => window.removeEventListener(e, start))
    }
  }, [])

  // React doesn't forward custom-element "load" events reliably, so listen directly.
  useEffect(() => {
    const el = mv.current
    if (!ready || !el) return
    const onLoad = () => setModelShown(true)
    if (el.loaded) queueMicrotask(onLoad)
    el.addEventListener("load", onLoad)
    return () => el.removeEventListener("load", onLoad)
  }, [ready])

  const onInteract = useCallback(() => {
    if (tracked.current) return
    tracked.current = true
    track("view_3d", { productSlug })
  }, [productSlug])

  const zoom = (steps: number) => {
    onInteract()
    mv.current?.zoom(steps)
  }

  /** Swing the camera over the top (−1) or underneath (+1) the jhoomar, keeping the side angle and distance. */
  const tilt = (direction: -1 | 1) => {
    onInteract()
    const el = mv.current
    if (!el) return
    const { theta, phi, radius } = el.getCameraOrbit()
    // Quick repeated taps: step on from where the last tap is heading, not from mid-swing.
    const recent = tiltGoal.current && Date.now() - tiltGoal.current.at < 1200 ? tiltGoal.current.phiDeg : null
    const next = nextCameraPhi(recent ?? (phi * 180) / Math.PI, direction)
    tiltGoal.current = { phiDeg: next, at: Date.now() }
    el.setAttribute("camera-orbit", `${theta}rad ${next}deg ${radius}m`)
  }

  const reset = () => {
    const el = mv.current
    if (!el) return
    tiltGoal.current = null
    el.setAttribute("camera-orbit", START.orbit)
    el.setAttribute("camera-target", START.target)
    el.setAttribute("field-of-view", START.fov)
  }

  const toggleExpanded = async () => {
    onInteract()
    const next = !expanded
    setExpanded(next)
    // Real fullscreen where the browser allows it (Android, desktop); iPhone uses the CSS overlay.
    try {
      if (next && frame.current?.requestFullscreen) await frame.current.requestFullscreen()
      else if (!next && document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* CSS overlay is enough */
    }
  }

  // Keep state in sync with the browser's own fullscreen exit (Esc / back), lock page scroll while expanded.
  useEffect(() => {
    if (!expanded) return
    const onFsChange = () => {
      if (!document.fullscreenElement) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("fullscreenchange", onFsChange)
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("fullscreenchange", onFsChange)
      window.removeEventListener("keydown", onKey)
    }
  }, [expanded])

  const toolButton =
    "flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-background active:scale-95"

  return (
    // The outer box keeps its size in the page (no layout shift) while the viewer goes full screen.
    <div className="relative aspect-[4/5] w-full">
      <div
        ref={frame}
        data-expanded={expanded || undefined}
        className={
          expanded
            ? "fixed inset-0 z-50 bg-[radial-gradient(circle_at_50%_45%,#fffaf0,#efe6d4)]"
            : "absolute inset-0 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_45%,#fffaf0,#efe6d4)]"
        }
      >
        {/* Poster: always rendered underneath so there's never a blank box. */}
        <Image
          src={poster}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={`object-contain transition-opacity duration-300 ${modelShown ? "opacity-0" : ""}`}
        />
        {ready && !failed && (
          <model-viewer
            ref={mv as React.Ref<HTMLElement>}
            src={src}
            poster={poster}
            alt={alt}
            camera-controls=""
            // Inline: one-finger vertical swipes still scroll the page. Full screen: every gesture goes to 3D.
            touch-action={expanded ? "none" : "pan-y"}
            interaction-prompt="auto"
            camera-orbit={START.orbit}
            camera-target={START.target}
            field-of-view={START.fov}
            min-camera-orbit="auto 10deg 0.25m"
            max-camera-orbit="auto 170deg 8m"
            min-field-of-view="8deg"
            max-field-of-view="45deg"
            interpolation-decay="120"
            environment-image="neutral"
            exposure="1.05"
            shadow-intensity="0"
            loading="eager"
            reveal="auto"
            className="absolute inset-0"
            style={{ ["--poster-color" as string]: "transparent" }}
            onPointerDown={onInteract}
            onWheel={onInteract}
            onError={() => setFailed(true)}
          />
        )}

        {ready && !failed && (
          <div className="absolute top-3 right-3 flex flex-col gap-2" role="toolbar" aria-label="3D view controls">
            <button type="button" className={toolButton} onClick={toggleExpanded} aria-label={expanded ? t.viewer.exitFullscreen : t.viewer.fullscreen} title={expanded ? t.viewer.exitFullscreen : t.viewer.fullscreen}>
              {expanded ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </button>
            <button type="button" className={toolButton} onClick={() => zoom(2)} aria-label={t.viewer.zoomIn} title={t.viewer.zoomIn}>
              <ZoomIn className="size-5" />
            </button>
            <button type="button" className={toolButton} onClick={() => zoom(-2)} aria-label={t.viewer.zoomOut} title={t.viewer.zoomOut}>
              <ZoomOut className="size-5" />
            </button>
            <button type="button" className={toolButton} onClick={() => tilt(-1)} aria-label={t.viewer.fromAbove} title={t.viewer.fromAbove}>
              <ChevronsUp className="size-5" />
            </button>
            <button type="button" className={toolButton} onClick={() => tilt(1)} aria-label={t.viewer.fromBelow} title={t.viewer.fromBelow}>
              <ChevronsDown className="size-5" />
            </button>
            <button type="button" className={toolButton} onClick={reset} aria-label={t.viewer.reset} title={t.viewer.reset}>
              <RotateCcw className="size-5" />
            </button>
          </div>
        )}

        {!ready && !failed ? (
          <button
            type="button"
            onClick={() => loadNow.current()}
            className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-background/85 px-4 py-2 text-xs font-medium shadow-sm backdrop-blur"
          >
            {t.viewer.load3d}
          </button>
        ) : (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 px-4 text-center text-xs text-muted-foreground">
            {failed ? t.viewer.error : touch ? t.viewer.rotateHint : t.viewer.rotateHintDesktop}
          </p>
        )}
      </div>
    </div>
  )
}
