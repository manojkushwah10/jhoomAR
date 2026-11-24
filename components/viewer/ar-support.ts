"use client"

export type ArPlatform = "quick-look" | "scene-viewer" | "none"

/**
 * Cheap AR capability check that doesn't need <model-viewer> loaded:
 *  - iPhone/iPad Safari (and iOS browsers using WebKit) support <a rel="ar"> Quick Look.
 *  - Android Chrome can hand off to Google's Scene Viewer (needs Google Play Services for AR;
 *    if missing, model-viewer falls back and we show a friendly message).
 */
export function detectArPlatform(): ArPlatform {
  if (typeof document === "undefined") return "none"
  const anchor = document.createElement("a")
  if (anchor.relList?.supports?.("ar")) return "quick-look"
  const ua = navigator.userAgent
  if (/android/i.test(ua) && !/firefox|fban|fbav|instagram/i.test(ua)) return "scene-viewer"
  return "none"
}

/** model-viewer adds this hash when Scene Viewer could not open on Android. */
export const NO_AR_FALLBACK_HASH = "#model-viewer-no-ar-fallback"
