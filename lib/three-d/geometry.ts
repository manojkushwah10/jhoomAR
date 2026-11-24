/**
 * Tiny procedural geometry kit (metres, +Y up, glTF conventions).
 * Every builder returns indexed triangles with analytic normals; `orient()` then
 * guarantees counter-clockwise (front-facing) winding against those normals.
 */

export type Geometry = {
  positions: number[]
  normals: number[]
  indices: number[]
}

export type Vec3 = [number, number, number]

const TAU = Math.PI * 2

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const scaleV = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const addV = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

function empty(): Geometry {
  return { positions: [], normals: [], indices: [] }
}

function pushVertex(g: Geometry, p: Vec3, n: Vec3): number {
  g.positions.push(p[0], p[1], p[2])
  const nn = normalize(n)
  g.normals.push(nn[0], nn[1], nn[2])
  return g.positions.length / 3 - 1
}

function vec(g: Geometry, attr: "positions" | "normals", i: number): Vec3 {
  const a = g[attr]
  return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
}

/** Flip any triangle whose winding disagrees with its vertex normals. */
export function orient(g: Geometry): Geometry {
  for (let t = 0; t < g.indices.length; t += 3) {
    const [ia, ib, ic] = [g.indices[t], g.indices[t + 1], g.indices[t + 2]]
    const face = cross(sub(vec(g, "positions", ib), vec(g, "positions", ia)), sub(vec(g, "positions", ic), vec(g, "positions", ia)))
    const avg = addV(addV(vec(g, "normals", ia), vec(g, "normals", ib)), vec(g, "normals", ic))
    if (dot(face, avg) < 0) {
      g.indices[t + 1] = ic
      g.indices[t + 2] = ib
    }
  }
  return g
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Vertical cylinder centred on the origin, from y = -h/2 to y = +h/2. */
export function cylinder(radius: number, height: number, segments = 24, caps = true): Geometry {
  const g = empty()
  const y0 = -height / 2
  const y1 = height / 2
  const ring: Array<[number, number]> = []
  for (let j = 0; j <= segments; j++) {
    const a = (j / segments) * TAU
    ring.push([Math.cos(a), Math.sin(a)])
  }
  for (let j = 0; j < segments; j++) {
    const [c0, s0] = ring[j]
    const [c1, s1] = ring[j + 1]
    const a = pushVertex(g, [radius * c0, y0, radius * s0], [c0, 0, s0])
    const b = pushVertex(g, [radius * c0, y1, radius * s0], [c0, 0, s0])
    const c = pushVertex(g, [radius * c1, y0, radius * s1], [c1, 0, s1])
    const d = pushVertex(g, [radius * c1, y1, radius * s1], [c1, 0, s1])
    g.indices.push(a, b, c, c, b, d)
  }
  if (caps) {
    for (const [y, ny] of [[y1, 1], [y0, -1]] as const) {
      const centre = pushVertex(g, [0, y, 0], [0, ny, 0])
      for (let j = 0; j < segments; j++) {
        const p = pushVertex(g, [radius * ring[j][0], y, radius * ring[j][1]], [0, ny, 0])
        const q = pushVertex(g, [radius * ring[j + 1][0], y, radius * ring[j + 1][1]], [0, ny, 0])
        g.indices.push(centre, p, q)
      }
    }
  }
  return orient(g)
}

/** UV sphere (optionally stretched vertically by `stretchY`). */
export function sphere(radius: number, widthSegments = 16, heightSegments = 12, stretchY = 1): Geometry {
  const g = empty()
  const grid: number[][] = []
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments
    const row: number[] = []
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments
      const x = -Math.cos(u * TAU) * Math.sin(v * Math.PI)
      const y = Math.cos(v * Math.PI)
      const z = Math.sin(u * TAU) * Math.sin(v * Math.PI)
      // Ellipsoid normal: divide by the axis scale.
      row.push(pushVertex(g, [radius * x, radius * stretchY * y, radius * z], [x, y / stretchY, z]))
    }
    grid.push(row)
  }
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = grid[iy][ix + 1]
      const b = grid[iy][ix]
      const c = grid[iy + 1][ix]
      const d = grid[iy + 1][ix + 1]
      if (iy !== 0) g.indices.push(a, b, d)
      if (iy !== heightSegments - 1) g.indices.push(b, c, d)
    }
  }
  return orient(g)
}

/** Torus lying flat in the XZ plane (a horizontal ring). */
export function torus(majorRadius: number, minorRadius: number, tubular = 64, radial = 10): Geometry {
  const g = empty()
  const grid: number[][] = []
  for (let i = 0; i <= tubular; i++) {
    const u = (i / tubular) * TAU
    const dir: Vec3 = [Math.cos(u), 0, Math.sin(u)]
    const centre = scaleV(dir, majorRadius)
    const row: number[] = []
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * TAU
      const n = addV(scaleV(dir, Math.cos(v)), [0, Math.sin(v), 0])
      row.push(pushVertex(g, addV(centre, scaleV(n, minorRadius)), n))
    }
    grid.push(row)
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = grid[i][j]
      const b = grid[i + 1][j]
      const c = grid[i + 1][j + 1]
      const d = grid[i][j + 1]
      g.indices.push(a, b, d, b, c, d)
    }
  }
  return orient(g)
}

/** Tube of constant radius swept along a polyline (parallel-transport frames, open ends). */
export function tube(path: Vec3[], radius: number, radial = 8): Geometry {
  const g = empty()
  const tangents = path.map((_, i) =>
    normalize(sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)])),
  )
  let normal = normalize(cross(tangents[0], Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const grid: number[][] = []
  path.forEach((p, i) => {
    const t = tangents[i]
    normal = normalize(sub(normal, scaleV(t, dot(normal, t))))
    const binormal = cross(t, normal)
    const row: number[] = []
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * TAU
      const n = addV(scaleV(normal, Math.cos(v)), scaleV(binormal, Math.sin(v)))
      row.push(pushVertex(g, addV(p, scaleV(n, radius)), n))
    }
    grid.push(row)
  })
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = grid[i][j]
      const b = grid[i + 1][j]
      const c = grid[i + 1][j + 1]
      const d = grid[i][j + 1]
      g.indices.push(a, b, d, b, c, d)
    }
  }
  return orient(g)
}

/** Faceted crystal drop: two pyramids sharing an equator at y = 0 (flat shading). */
export function crystalDrop(radius: number, topHeight: number, bottomHeight: number, sides = 8): Geometry {
  const g = empty()
  const top: Vec3 = [0, topHeight, 0]
  const bottom: Vec3 = [0, -bottomHeight, 0]
  for (let j = 0; j < sides; j++) {
    const a0 = (j / sides) * TAU
    const a1 = ((j + 1) / sides) * TAU
    const p: Vec3 = [radius * Math.cos(a0), 0, radius * Math.sin(a0)]
    const q: Vec3 = [radius * Math.cos(a1), 0, radius * Math.sin(a1)]
    for (const apex of [top, bottom]) {
      let n = normalize(cross(sub(p, apex), sub(q, apex)))
      const centroid = scaleV(addV(addV(p, q), apex), 1 / 3)
      if (dot(n, centroid) < 0) n = scaleV(n, -1)
      const i = pushVertex(g, apex, n)
      g.indices.push(i, pushVertex(g, p, n), pushVertex(g, q, n))
    }
  }
  return orient(g)
}

/** Flat ring (annulus) facing +Y. innerRadius = 0 gives a filled disc. */
export function annulus(innerRadius: number, outerRadius: number, segments = 64): Geometry {
  const g = empty()
  const up: Vec3 = [0, 1, 0]
  for (let j = 0; j < segments; j++) {
    const a0 = (j / segments) * TAU
    const a1 = ((j + 1) / segments) * TAU
    const o0 = pushVertex(g, [outerRadius * Math.cos(a0), 0, outerRadius * Math.sin(a0)], up)
    const o1 = pushVertex(g, [outerRadius * Math.cos(a1), 0, outerRadius * Math.sin(a1)], up)
    if (innerRadius <= 0) {
      g.indices.push(pushVertex(g, [0, 0, 0], up), o0, o1)
    } else {
      const i0 = pushVertex(g, [innerRadius * Math.cos(a0), 0, innerRadius * Math.sin(a0)], up)
      const i1 = pushVertex(g, [innerRadius * Math.cos(a1), 0, innerRadius * Math.sin(a1)], up)
      g.indices.push(i0, o0, o1, i0, o1, i1)
    }
  }
  return orient(g)
}

/** Quadratic Bézier sampled into `steps + 1` points. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, steps = 24): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1], a * p0[2] + b * p1[2] + c * p2[2]])
  }
  return out
}

// ---------------------------------------------------------------------------
// Transforms (return new geometry)
// ---------------------------------------------------------------------------

function mapGeometry(g: Geometry, fp: (p: Vec3) => Vec3, fn: (n: Vec3) => Vec3): Geometry {
  const out: Geometry = { positions: [], normals: [], indices: [...g.indices] }
  for (let i = 0; i < g.positions.length / 3; i++) {
    out.positions.push(...fp(vec(g, "positions", i)))
    out.normals.push(...normalize(fn(vec(g, "normals", i))))
  }
  return out
}

export const translate = (g: Geometry, x: number, y: number, z: number) =>
  mapGeometry(g, (p) => [p[0] + x, p[1] + y, p[2] + z], (n) => n)

export const rotateY = (g: Geometry, angle: number) => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const r = (v: Vec3): Vec3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]
  return mapGeometry(g, r, r)
}

export const rotateX = (g: Geometry, angle: number) => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const r = (v: Vec3): Vec3 => [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]
  return mapGeometry(g, r, r)
}

/** Non-uniform scale; normals use the inverse-transpose so lighting stays correct. */
export const scale = (g: Geometry, sx: number, sy: number, sz: number) =>
  mapGeometry(g, (p) => [p[0] * sx, p[1] * sy, p[2] * sz], (n) => [n[0] / sx, n[1] / sy, n[2] / sz])

export function merge(parts: Geometry[]): Geometry {
  const out = empty()
  for (const part of parts) {
    const offset = out.positions.length / 3
    out.positions.push(...part.positions)
    out.normals.push(...part.normals)
    for (const i of part.indices) out.indices.push(i + offset)
  }
  return out
}

/** Repeat `g` `count` times around the Y axis at `radius`. */
export function ringOf(g: Geometry, count: number, radius: number, y = 0, phase = 0): Geometry {
  const parts: Geometry[] = []
  for (let k = 0; k < count; k++) {
    const a = phase + (k / count) * TAU
    parts.push(translate(g, radius * Math.cos(a), y, radius * Math.sin(a)))
  }
  return merge(parts)
}
