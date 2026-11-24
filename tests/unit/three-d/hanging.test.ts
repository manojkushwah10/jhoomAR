import { describe, expect, it } from "vitest"
import { createHangingVariant } from "@/lib/three-d/hanging"
import { sceneBounds } from "@/lib/three-d/inspect"
import { buildPlaceholderJhoomar } from "@/lib/three-d/placeholder"
import { CEILING_PRESETS } from "@/lib/three-d/presets"
import { getBounds } from "@gltf-transform/core"

describe("hanging AR variant", () => {
  const source = buildPlaceholderJhoomar()

  it.each(CEILING_PRESETS.map((p) => [p.label, p.metres] as const))(
    "%s ceiling: canopy at the ceiling, floor marker on the floor",
    (_label, ceiling) => {
      const doc = createHangingVariant(source, ceiling)
      const b = sceneBounds(doc)
      // Whole-scene bounding box spans floor (marker) → ceiling (canopy).
      expect(b.min[1]).toBeCloseTo(0, 5)
      expect(b.max[1]).toBeCloseTo(ceiling, 5)
      // Centred above the marker.
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 5)
      expect((b.min[2] + b.max[2]) / 2).toBeCloseTo(0, 5)

      // The light itself: bottom = ceiling − (drop 40 cm + body 90 cm).
      const scene = doc.getRoot().getDefaultScene()!
      const lifted = scene.listChildren().find((n) => n.getName().startsWith("Hanging"))!
      const lb = getBounds(lifted)
      expect(lb.max[1]).toBeCloseTo(ceiling, 5)
      expect(lb.min[1]).toBeCloseTo(ceiling - 1.3, 5)

      // Marker uses standard (not unlit) materials so the iPhone USDZ export keeps it.
      const markerMats = doc.getRoot().listMaterials().filter((m) => m.getName().startsWith("Floor marker"))
      expect(markerMats).toHaveLength(2)
      for (const m of markerMats) expect(m.getExtension("KHR_materials_unlit")).toBeNull()
    },
  )

  it("does not modify the source document", () => {
    createHangingVariant(source, 3.05)
    expect(sceneBounds(source).max[1]).toBeCloseTo(0, 5)
  })

  it("refuses a light taller than the ceiling", () => {
    expect(() => createHangingVariant(source, 1.2)).toThrow(/taller than/)
  })
})
