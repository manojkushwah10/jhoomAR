import { describe, expect, it } from "vitest"
import { boundsSize, sceneBounds, triangleCount } from "@/lib/three-d/inspect"
import { buildPlaceholderJhoomar } from "@/lib/three-d/placeholder"
import { BUDGET } from "@/lib/three-d/presets"

describe("placeholder jhoomar", () => {
  const doc = buildPlaceholderJhoomar() // 80 cm Ø × 90 cm body, 40 cm drop

  it("is real size: 80 cm wide, 130 cm total hanging length, 80 cm deep", () => {
    const [w, h, d] = boundsSize(sceneBounds(doc))
    expect(w).toBeCloseTo(0.8, 3)
    expect(h).toBeCloseTo(1.3, 3)
    expect(d).toBeCloseTo(0.8, 3)
  })

  it("hangs from its origin: canopy top at y = 0, bottom at y = −1.30", () => {
    const b = sceneBounds(doc)
    expect(b.max[1]).toBeCloseTo(0, 4)
    expect(b.min[1]).toBeCloseTo(-1.3, 4)
  })

  it("respects size options", () => {
    const small = buildPlaceholderJhoomar({ diameterCm: 60, bodyHeightCm: 70, dropLengthCm: 30 })
    const [w, h] = boundsSize(sceneBounds(small))
    expect(w).toBeCloseTo(0.6, 2)
    expect(h).toBeCloseTo(1.0, 2)
  })

  it("is within the triangle budget and has lit bulbs + crystal materials", () => {
    expect(triangleCount(doc)).toBeLessThan(BUDGET.maxTriangles)
    const names = doc.getRoot().listMaterials().map((m) => m.getName())
    expect(names).toEqual(expect.arrayContaining(["Brass", "Crystal", "Bulb (lit)"]))
    const bulb = doc.getRoot().listMaterials().find((m) => m.getName() === "Bulb (lit)")!
    expect(Math.max(...bulb.getEmissiveFactor())).toBeGreaterThan(0.5)
  })
})
