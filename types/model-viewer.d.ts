import type { DetailedHTMLProps, HTMLAttributes } from "react"

/** Minimal typing for the <model-viewer> custom element used in JSX. */
type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string
  poster?: string
  alt?: string
  loading?: "auto" | "lazy" | "eager"
  reveal?: "auto" | "manual"
  "camera-controls"?: boolean | ""
  "touch-action"?: string
  "camera-orbit"?: string
  "min-camera-orbit"?: string
  "max-camera-orbit"?: string
  "field-of-view"?: string
  "interaction-prompt"?: string
  "environment-image"?: string
  exposure?: string
  "shadow-intensity"?: string
  ar?: boolean | ""
  "ar-modes"?: string
  "ar-scale"?: string
  "ar-placement"?: string
  "ios-src"?: string
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes
    }
  }
}

export type ModelViewerElement = HTMLElement & {
  loaded: boolean
  canActivateAR: boolean
  activateAR(): Promise<void>
  src: string | null
  iosSrc: string | null
  toBlob(options?: { mimeType?: string; qualityArgument?: number; idealAspect?: boolean }): Promise<Blob>
}
