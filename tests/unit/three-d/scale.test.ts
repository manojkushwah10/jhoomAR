import { describe, expect, it } from "vitest"
import { boundsSize, sceneBounds } from "@/lib/three-d/inspect"
import { buildPlaceholderJhoomar } from "@/lib/three-d/placeholder"
import { applyUniformScale, checkScale } from "@/lib/three-d/scale"

describe("scale check", () => {
  it("passes when the model matches the product size", () => {
    const r = checkScale(buildPlaceholderJhoomar(), { widthCm: 80, heightCm: 130, depthCm: 80 })
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it("passes inside the 3% tolerance and warns outside it", () => {
    const doc = buildPlaceholderJhoomar()
    expect(checkScale(doc, { widthCm: 82, heightCm: 132 }).ok).toBe(true)
    const off = checkScale(doc, { widthCm: 90, heightCm: 130 })
    expect(off.ok).toBe(false)
    expect(off.warnings[0]).toMatch(/width is 80\.0 cm, but the product says 90 cm/)
  })

  it("detects a model made in centimetres and fixes it", () => {
    const doc = buildPlaceholderJhoomar()
    applyUniformScale(doc, 100) // simulate a file exported in cm instead of m
    const r = checkScale(doc, { widthCm: 80, heightCm: 130 })
    expect(r.ok).toBe(false)
    expect(r.suggestedFactor).toBeCloseTo(0.01, 4)
    applyUniformScale(doc, r.suggestedFactor)
    const [w, h] = boundsSize(sceneBounds(doc))
    expect(w).toBeCloseTo(0.8, 3)
    expect(h).toBeCloseTo(1.3, 3)
  })
})
