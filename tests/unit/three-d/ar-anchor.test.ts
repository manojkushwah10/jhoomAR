import { describe, expect, it } from "vitest"
import { ceilingAnchorShift, rotateAboutHorizontalAxis, tiltAxis } from "@/components/viewer/ar-overlay"

/** model-viewer scales about the floor: world y of model point Y = scale × (Y + lift), lift = −minY − shift. */
const worldY = (Y: number, minY: number, H: number, s: number) => s * (Y - minY - ceilingAnchorShift(H, s))

describe("ceilingAnchorShift", () => {
  const H = 3.05 // 10 ft hanging GLB: floor marker at 0, canopy at 3.05 m

  it("is zero at real size", () => {
    expect(ceilingAnchorShift(H, 1)).toBe(0)
  })

  it.each([0.25, 0.8, 1.25, 2, 4])("keeps the canopy at the ceiling at %d×", (s) => {
    expect(worldY(H, 0, H, s)).toBeCloseTo(H, 9)
  })

  it("moving the floor marker by the shift keeps it on the floor", () => {
    for (const s of [0.5, 1.25, 3]) {
      const k = ceilingAnchorShift(H, s)
      expect(worldY(0 + k, 0, H, s)).toBeCloseTo(0, 9)
    }
  })

  it("ignores bad input", () => {
    expect(ceilingAnchorShift(H, 0)).toBe(0)
    expect(ceilingAnchorShift(0, 2)).toBe(0)
    expect(ceilingAnchorShift(H, Number.NaN)).toBe(0)
  })
})

describe("AR tilt", () => {
  it("swings the body away from a viewer standing in front, so its top faces them", () => {
    // Camera at +z of the jhoomar, not turned.
    const a = tiltAxis(0, 2, 0)
    expect(a.x).toBeCloseTo(1)
    expect(a.z).toBeCloseTo(0)
    const body = rotateAboutHorizontalAxis({ x: 0, y: -1, z: 0 }, a.x, a.z, Math.PI / 2)
    expect(body.z).toBeCloseTo(-1) // away from the camera
    const topNormal = rotateAboutHorizontalAxis({ x: 0, y: 1, z: 0 }, a.x, a.z, Math.PI / 2)
    expect(topNormal.z).toBeCloseTo(1) // facing the camera
  })

  it("accounts for how far the jhoomar has been turned", () => {
    // Turned 90° (yaw): the room's +x is the jhoomar's own +z.
    const a = tiltAxis(3, 0, Math.PI / 2)
    const body = rotateAboutHorizontalAxis({ x: 0, y: -1, z: 0 }, a.x, a.z, Math.PI / 2)
    // Turn back into the room: body should point away from the camera (−x in the room).
    const roomX = body.x * Math.cos(Math.PI / 2) + body.z * Math.sin(Math.PI / 2)
    expect(roomX).toBeCloseTo(-1)
  })

  it("keeps lengths (pure rotation) and falls back when the camera is straight above/below", () => {
    const p = { x: 0.3, y: -0.7, z: 0.2 }
    const r = rotateAboutHorizontalAxis(p, Math.SQRT1_2, Math.SQRT1_2, 1.1)
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(Math.hypot(p.x, p.y, p.z))
    expect(tiltAxis(0, 0, 0)).toEqual({ x: 1, z: 0 })
  })
})
