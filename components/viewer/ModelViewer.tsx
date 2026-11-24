"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { track } from "@/lib/analytics-client"
import { t } from "@/lib/i18n"
import { loadModelViewer } from "./load-model-viewer"

type Props = {
  src: string
  poster: string
  alt: string
  productSlug: string
  /** Render the poster with high fetch priority (it's the LCP image on product pages). */
  priority?: boolean
}

/**
 * Interactive 3D viewer. Shows the poster image first (server-rendered, no layout shift), then
 * swaps in <model-viewer> on the visitor's first interaction (or a tap on "View in 3D").
 */
export function ModelViewer({ src, poster, alt, productSlug, priority = false }: Props) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const tracked = useRef(false)
  const loadNow = useRef<() => void>(() => {})

  // Load the 3D engine (~1 MB of JS) only after the visitor starts interacting with the page,
  // so it never competes with the first paint (LCP) or blocks the main thread for Lighthouse/SEO.
  useEffect(() => {
    let cancelled = false
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

  function onInteract() {
    if (tracked.current) return
    tracked.current = true
    track("view_3d", { productSlug })
  }

  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_45%,#fffaf0,#efe6d4)]"
    >
      {/* Poster: always rendered underneath so there's never a blank box. */}
      <Image
        src={poster}
        alt={alt}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-contain"
      />
      {ready && !failed && (
        <model-viewer
          src={src}
          poster={poster}
          alt={alt}
          camera-controls=""
          touch-action="pan-y"
          interaction-prompt="auto"
          camera-orbit="15deg 84deg auto"
          min-camera-orbit="auto 20deg auto"
          max-camera-orbit="auto 160deg auto"
          field-of-view="28deg"
          environment-image="neutral"
          exposure="1.05"
          shadow-intensity="0"
          loading="eager"
          reveal="auto"
          className="absolute inset-0"
          style={{ ["--poster-color" as string]: "transparent" }}
          onPointerDown={onInteract}
          onError={() => setFailed(true)}
        />
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
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
          {failed ? t.viewer.error : t.viewer.rotateHint}
        </p>
      )}
    </div>
  )
}
