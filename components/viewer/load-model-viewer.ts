"use client"

let loading: Promise<unknown> | undefined

/** Load <model-viewer> once, client-side only, with our self-hosted Draco decoder. */
export function loadModelViewer(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve()
  if (!loading) {
    const w = window as unknown as { ModelViewerElement?: Record<string, string> }
    w.ModelViewerElement = { ...(w.ModelViewerElement ?? {}), dracoDecoderLocation: "/vendor/draco/" }
    loading = import("@google/model-viewer")
  }
  return loading
}
