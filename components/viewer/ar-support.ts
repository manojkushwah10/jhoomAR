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
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  // Same rule as model-viewer: Chrome/Edge/Firefox/DuckDuckGo on iOS run in a WKWebView where
  // relList.supports("ar") is false, but they can still open AR Quick Look. The Google app (GSA) can't.
  if (isIOS && /CriOS|EdgiOS|FxiOS|DuckDuckGo/.test(ua) && !/GSA\//.test(ua)) return "quick-look"
  const anchor = document.createElement("a")
  if (anchor.relList?.supports?.("ar")) return "quick-look"
  if (/android/i.test(ua) && !/firefox|fban|fbav|instagram/i.test(ua)) return "scene-viewer"
  return "none"
}

/** model-viewer adds this hash when Scene Viewer could not open on Android. */
export const NO_AR_FALLBACK_HASH = "#model-viewer-no-ar-fallback"

/** Can Chrome run AR itself via WebXR (needs ARCore / "Google Play Services for AR")? */
export async function webXrArSupported(): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr
  try {
    return Boolean(xr && (await xr.isSessionSupported("immersive-ar")))
  } catch {
    return false
  }
}
