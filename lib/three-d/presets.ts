/** Shared 3D/AR constants. Units: metres unless the name says Cm. */

/** Ceiling heights offered in the "My ceiling is about…" picker. */
export const CEILING_PRESETS = [
  { id: "275", label: "9 ft", metres: 2.75 },
  { id: "305", label: "10 ft", metres: 3.05 },
  { id: "335", label: "11 ft", metres: 3.35 },
  { id: "365", label: "12 ft", metres: 3.65 },
] as const

export type CeilingPresetId = (typeof CEILING_PRESETS)[number]["id"]

export const DEFAULT_CEILING_ID: CeilingPresetId = "275"

/** Performance budgets (CLAUDE.md §6.6). */
export const BUDGET = {
  targetBytes: 5 * 1024 * 1024,
  maxBytes: 8 * 1024 * 1024,
  maxTriangles: 150_000,
} as const

/** Allowed difference between model size and the dimensions typed in by the admin. */
export const SCALE_TOLERANCE = 0.03

/** File name of the hanging AR variant for a ceiling preset, e.g. "ar-275.glb". */
export const arFileName = (id: CeilingPresetId, ext: "glb" | "usdz" = "glb") => `ar-${id}.${ext}`
