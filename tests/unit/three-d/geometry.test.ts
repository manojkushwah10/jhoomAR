import { describe, expect, it } from "vitest"
import { annulus, crystalDrop, cylinder, sphere, torus, tube, bezier, scale, rotateX, type Geometry } from "@/lib/three-d/geometry"

/** Every triangle's winding must agree with its vertex normals (front faces point outwards). */
function windingErrors(g: Geometry): number {
  let bad = 0
  const p = (i: number) => g.positions.slice(i * 3, i * 3 + 3)
  const n = (i: number) => g.normals.slice(i * 3, i * 3 + 3)
  for (let t = 0; t < g.indices.length; t += 3) {
    const [a, b, c] = [g.indices[t], g.indices[t + 1], g.indices[t + 2]]
    const [pa, pb, pc] = [p(a), p(b), p(c)]
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
    const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const avg = [0, 1, 2].map((k) => n(a)[k] + n(b)[k] + n(c)[k])
    if (face[0] * avg[0] + face[1] * avg[1] + face[2] * avg[2] < 0) bad++
  }
  return bad
}

const cases: Array<[string, Geometry]> = [
  ["cylinder", cylinder(0.1, 0.2)],
  ["sphere", sphere(0.1)],
  ["stretched sphere", sphere(0.1, 16, 12, 1.7)],
  ["torus", torus(0.3, 0.01)],
  ["tube", tube(bezier([0, 0, 0], [0.3, -0.1, 0], [0.36, 0.1, 0]), 0.01)],
  ["crystal drop", crystalDrop(0.01, 0.01, 0.03)],
  ["annulus", annulus(0.3, 0.4)],
  ["disc", annulus(0, 0.4)],
  ["scaled + rotated torus", rotateX(scale(torus(0.009, 0.0025), 1, 1, 1.5), Math.PI / 2)],
]

describe("procedural geometry", () => {
  it.each(cases)("%s has consistent outward winding and unit normals", (_name, g) => {
    expect(g.indices.length % 3).toBe(0)
    expect(g.positions.length).toBe(g.normals.length)
    expect(windingErrors(g)).toBe(0)
    for (let i = 0; i < g.normals.length; i += 3) {
      expect(Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2])).toBeCloseTo(1, 5)
    }
    expect(g.positions.every(Number.isFinite)).toBe(true)
  })
})
