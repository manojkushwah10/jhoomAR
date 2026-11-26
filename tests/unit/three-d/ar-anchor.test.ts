import { describe, expect, it } from "vitest"
import {
  IDENTITY,
  ceilingAnchorShift,
  dragTurn,
  isUpright,
  pinchScale,
  quatAngle,
  quatAxisAngle,
  quatConj,
  quatMul,
  quatRotate,
  quatSlerp,
} from "@/components/viewer/ar-overlay"

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

describe("AR finger turning", () => {
  const right = { x: 1, z: 0 } // phone looking along −z (standing in front of the jhoomar)
  const W = 400

  it("left/right drag spins it about the vertical, like model-viewer (drag right → front moves right)", () => {
    const q = dragTurn(100, 0, W, right)
    const front = quatRotate(q, { x: 0, y: 0, z: 1 })
    expect(front.x).toBeGreaterThan(0)
    expect(isUpright(q)).toBe(true)
  })

  it("dragging down swings its top towards you (see the top); up shows the underneath", () => {
    const down = dragTurn(0, 120, W, right)
    expect(quatRotate(down, { x: 0, y: 1, z: 0 }).z).toBeGreaterThan(0)
    expect(isUpright(down)).toBe(false)
    const up = dragTurn(0, -120, W, right)
    expect(quatRotate(up, { x: 0, y: 1, z: 0 }).z).toBeLessThan(0)
  })

  it("can turn it all the way round, any direction (no limits, like a 3D viewer)", () => {
    // Half a turn's worth of drag downwards → upside down.
    const pxForHalfTurn = (Math.PI / (Math.PI * 1.2)) * W
    const q = dragTurn(0, pxForHalfTurn, W, right)
    expect(quatRotate(q, { x: 0, y: 1, z: 0 }).y).toBeCloseTo(-1, 5)
  })

  it("swings about the viewer's sideways direction wherever they stand", () => {
    // Standing to the side: camera's right points along −z.
    const q = dragTurn(0, 120, W, { x: 0, z: -1 })
    const top = quatRotate(q, { x: 0, y: 1, z: 0 })
    expect(top.x).toBeGreaterThan(0) // towards a viewer standing at +x
    expect(Math.abs(top.z)).toBeLessThan(1e-9)
  })

  it("quaternion helpers keep lengths, compose and interpolate", () => {
    const a = quatAxisAngle(0, 1, 0, 1)
    const b = quatAxisAngle(1, 0, 0, 0.5)
    const p = { x: 0.3, y: -0.7, z: 0.2 }
    const r = quatRotate(quatMul(b, a), p)
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(Math.hypot(p.x, p.y, p.z))
    const seq = quatRotate(b, quatRotate(a, p))
    expect(r.x).toBeCloseTo(seq.x)
    expect(r.y).toBeCloseTo(seq.y)
    expect(r.z).toBeCloseTo(seq.z)
    expect(quatAngle(quatSlerp(IDENTITY, a, 0.5), IDENTITY)).toBeCloseTo(0.5)
    expect(quatAngle(quatMul(a, quatConj(a)), IDENTITY)).toBeCloseTo(0)
  })
})

describe("AR pinch zoom", () => {
  it("follows the finger spread and snaps to real size near 100 %", () => {
    expect(pinchScale(1, 100, 150)).toBeCloseTo(1.5)
    expect(pinchScale(1.5, 100, 70)).toBe(1) // 1.05 → snaps
    expect(pinchScale(1, 100, 104)).toBe(1)
  })

  it("stays between 25 % and 400 %", () => {
    expect(pinchScale(1, 100, 10)).toBe(0.25)
    expect(pinchScale(2, 100, 1000)).toBe(4)
    expect(pinchScale(1.3, 0, 50)).toBe(1.3)
  })
})
