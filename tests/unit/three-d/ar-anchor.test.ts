import { describe, expect, it } from "vitest"
import { aimSpot, ceilingAnchorShift, dragSpin, isFloorHit, nextTilt, pinchScale, placementSpot, rotateAboutHorizontalAxis, tiltAxis } from "@/components/viewer/ar-overlay"

/** model-viewer scales about the floor: world y of model point Y = scale × (Y + lift), lift = −minY − shift. */
const worldY = (Y: number, minY: number, H: number, s: number) => s * (Y - minY - ceilingAnchorShift(H, s))

describe("ceilingAnchorShift", () => {
  const H = 3.05 // 10 ft hanging GLB: floor marker at 0, canopy at 3.05 m

  it("is zero at real size", () => {
    expect(ceilingAnchorShift(H, 1)).toBe(0)
  })

  it.each([1, 1.25, 2, 4])("keeps the canopy at the ceiling at %d×", (s) => {
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

describe("AR placement (like a real jhoomar)", () => {
  it("only takes a surface well below the phone as the floor (skips tables, beds, counters)", () => {
    // Local AR space: phone at y = 0.
    expect(isFloorHit(0, -1.35)).toBe(true) // floor, phone held at 1.35 m
    expect(isFloorHit(0, -0.55)).toBe(false) // table top 0.75 m high, phone at 1.3 m
    expect(isFloorHit(0, -0.6)).toBe(true)
  })

  it("hangs it above the floor point the phone aims at", () => {
    const spot = placementSpot({ x: 0, z: 0 }, { x: 0, z: -1.6 }, { x: 0, z: -1 })
    expect(spot.x).toBeCloseTo(0)
    expect(spot.z).toBeCloseTo(-1.6)
  })

  it("never puts it at or behind the far wall (model-viewer alone puts it ~3.5 m away)", () => {
    const spot = placementSpot({ x: 1, z: 2 }, { x: 1, z: -3 }, { x: 0, z: -1 })
    expect(Math.hypot(spot.x - 1, spot.z - 2)).toBeCloseTo(2.5)
    expect(spot.x).toBeCloseTo(1)
  })

  it("not right on top of the phone either", () => {
    const close = placementSpot({ x: 0, z: 0 }, { x: 0.1, z: 0 }, { x: 0, z: -1 })
    expect(Math.hypot(close.x, close.z)).toBeCloseTo(0.6)
    const under = placementSpot({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: -1 })
    expect(under.z).toBeCloseTo(-1) // aiming straight down: 1 m ahead
  })

  it("one-finger drag only spins it (right → turns right), proportional to the drag", () => {
    expect(dragSpin(100, 400)).toBeGreaterThan(0)
    expect(dragSpin(-200, 400)).toBeCloseTo(-2 * dragSpin(100, 400))
    expect(dragSpin(400, 400)).toBeCloseTo(Math.PI * 1.2)
  })
})

describe("AR place point", () => {
  const forward = { x: 0, z: -1 }

  it("is where the phone's view meets the floor", () => {
    // Phone 1.4 m up, looking 45° down: the floor point is 1.4 m ahead.
    const spot = aimSpot({ x: 0, y: 1.4, z: 0 }, { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 }, 0, forward)
    expect(spot.x).toBeCloseTo(0)
    expect(spot.z).toBeCloseTo(-1.4)
  })

  it("stays within easy viewing distance when looking level, up or straight down", () => {
    const level = aimSpot({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, 0, forward)
    expect(level.z).toBeCloseTo(-2.5)
    const up = aimSpot({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0.8, z: -0.6 }, 0, forward)
    expect(up.z).toBeCloseTo(-2.5)
    const down = aimSpot({ x: 0, y: 1.4, z: 0 }, { x: 0, y: -1, z: 0 }, 0, forward)
    expect(down.z).toBeCloseTo(-1) // straight down: 1 m ahead, not on top of the phone
  })
})

describe("AR tilt (see the top / underneath)", () => {
  it("steps 30° at a time, up to 90° either way", () => {
    expect(nextTilt(0, 1)).toBeCloseTo(Math.PI / 6)
    expect(nextTilt(Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2)
    expect(nextTilt(-Math.PI / 2, -1)).toBeCloseTo(-Math.PI / 2)
  })

  it("swings the body away from the viewer for a positive tilt, keeping the canopy fixed", () => {
    // Viewer stands at +z from the jhoomar; canopy at the origin, body 1 m below it.
    const axis = tiltAxis(0, 1, 0)
    const body = rotateAboutHorizontalAxis({ x: 0, y: -1, z: 0 }, axis.x, axis.z, Math.PI / 6)
    expect(body.z).toBeLessThan(0) // away from the viewer
    expect(Math.hypot(body.x, body.y, body.z)).toBeCloseTo(1)
    const canopy = rotateAboutHorizontalAxis({ x: 0, y: 0, z: 0 }, axis.x, axis.z, Math.PI / 6)
    expect(Math.hypot(canopy.x, canopy.y, canopy.z)).toBeCloseTo(0)
  })
})

describe("AR pinch zoom", () => {
  it("follows the finger spread and snaps to real size near 100 %", () => {
    expect(pinchScale(1, 100, 150)).toBeCloseTo(1.5)
    expect(pinchScale(1.5, 100, 70)).toBe(1) // 1.05 → snaps
    expect(pinchScale(1, 100, 104)).toBe(1)
  })

  it("never goes smaller than real size (zoom in only), up to 400 %", () => {
    expect(pinchScale(1, 100, 10)).toBe(1)
    expect(pinchScale(2, 100, 30)).toBe(1)
    expect(pinchScale(2, 100, 1000)).toBe(4)
    expect(pinchScale(1.3, 0, 50)).toBe(1.3)
  })
})
