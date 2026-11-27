"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera view for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it part of
 * model-viewer's AR "DOM overlay", drawn on top of the camera.
 *
 * A jhoomar behaves like the real thing: it hangs straight down from one fixed point on the ceiling.
 *  - Scan: until the floor is found (never a table or bed) the jhoomar is hidden.
 *  - Aim: the jhoomar and a gold ring on the floor follow the floor point the phone aims at (within easy
 *    viewing distance, never "inside" a wall). "Place here" fixes it there.
 *  - Placed: it is locked to that spot. Nothing moves it — not zooming, not turning — until "Move" is tapped.
 *    One finger left/right spins it where it hangs; pinch zooms IN only (never smaller than real size; the
 *    canopy stays at the ceiling); twist spins; double-tap = real size, straight, facing as placed.
 *    ▲ Top / ▼ Below swing it about its ceiling point so its top or underneath can be seen; Straight undoes it.
 *
 * model-viewer's own AR touch handling is switched off by cancelling `beforexrselect` on our full-screen layer;
 * we drive its internal scene/renderer instead (private API, reached through its `renderer`/`scene` Symbols,
 * pinned to model-viewer 4.4 — re-check on upgrade).
 */

type Vec3Like = { x: number; y: number; z: number }
type MaterialLike = { visible: boolean }
type QuatLike = { x: number; y: number; z: number; w: number; set: (x: number, y: number, z: number, w: number) => unknown }
type ArRendererLike = {
  goalScale: number
  goalYaw: number
  isPresenting?: boolean
  goalPosition?: Vec3Like
  placementBox?: { edgeMaterial?: MaterialLike; fillMaterial?: MaterialLike } | null
  getHitPoint?: (hit: unknown) => Vec3Like | null
}
type Object3DLike = {
  name: string
  visible: boolean
  position: Vec3Like
  quaternion: QuatLike
  material?: { opacity?: number }
  traverse?: (fn: (o: Object3DLike) => void) => void
}
type CameraLike = { matrixWorld: { elements: number[] }; projectionMatrix?: { elements: number[] } }
type SceneLike = {
  scenePivot?: { scale: { x: number }; position: Vec3Like; quaternion: QuatLike }
  target?: Object3DLike
  goalTarget?: Vec3Like
  boundingBox?: { min: Vec3Like; max: Vec3Like }
  getCamera?: () => CameraLike
  updateTarget?: (delta: number) => boolean
  setShadowIntensity?: (v: number) => void
  setShadowOffset?: (v: number) => void
}

/** Zoom never goes below real size (the size for the chosen ceiling height): zoom in only. */
export const MIN_SCALE = 1
export const MAX_SCALE = 4
/** Tilt ("see the top / see underneath"): one tap = 30°, at most 90° either way. */
const TILT_STEP = Math.PI / 6
const TILT_MAX = Math.PI / 2
/** Pinching to within 6 % of real size snaps to exactly real size. */
const SCALE_SNAP = 0.06
/** One-finger drag across the short side of the screen spins it this far (radians). */
const SPIN_PER_SCREEN = Math.PI * 1.2
/** Taps: max movement (px) and time (ms) for a tap, max gap (ms) between the two taps of a double-tap. */
const TAP_MOVE = 12
const TAP_TIME = 280
const DOUBLE_TAP_GAP = 320

/**
 * A flat surface counts as the floor only if it's at least this far below the phone. People hold the phone
 * at ~1.1–1.6 m; tables (~0.75 m) and kitchen counters are then well under this gap, so they're skipped.
 */
export const MIN_FLOOR_DROP_M = 0.6
/** Comfortable viewing distance (horizontal, phone → point under the canopy), as AR design guides advise. */
export const MIN_PLACE_M = 0.6
export const MAX_PLACE_M = 2.5
/** If no floor is found: assume the phone is this high and hang it this far ahead. */
const FALLBACK_PHONE_HEIGHT_M = 1.4
const FALLBACK_DISTANCE_M = 1.5

// ---------- Pure helpers (unit-tested) ----------

/** Is a flat, upward-facing hit at `hitY` low enough under the phone (at `cameraY`) to be the floor? */
export function isFloorHit(cameraY: number, hitY: number): boolean {
  return cameraY - hitY >= MIN_FLOOR_DROP_M
}

/**
 * Where on the floor (x, z) the jhoomar should hang: the point the phone aims at, pulled into the
 * comfortable range around the phone so it's never placed at (or behind) the far wall.
 */
export function placementSpot(camera: { x: number; z: number }, hit: { x: number; z: number }, forward: { x: number; z: number }) {
  let dx = hit.x - camera.x
  let dz = hit.z - camera.z
  let d = Math.hypot(dx, dz)
  if (d < 1e-6) {
    dx = forward.x
    dz = forward.z
    d = Math.hypot(dx, dz) || 1
  }
  const k = Math.min(MAX_PLACE_M, Math.max(MIN_PLACE_M, d)) / d
  return { x: camera.x + dx * k, z: camera.z + dz * k }
}

/**
 * The floor point (x, z) the phone is aiming at — where its view direction `dir` meets the floor at height
 * `floorY` — pulled into the comfortable range. Looking level or up: as far ahead as allowed.
 */
export function aimSpot(camera: Vec3Like, dir: Vec3Like, floorY: number, forward: { x: number; z: number }) {
  let hit = { x: camera.x + forward.x * MAX_PLACE_M, z: camera.z + forward.z * MAX_PLACE_M }
  if (dir.y < -0.05 && camera.y > floorY) {
    const k = (floorY - camera.y) / dir.y
    hit = { x: camera.x + dir.x * k, z: camera.z + dir.z * k }
  }
  return placementSpot(camera, hit, forward)
}

/**
 * Horizontal tilt axis (in the jhoomar's own turned frame) for swinging it away from / towards the viewer.
 * Positive tilt about this axis swings the body away from the camera, so its top faces the viewer.
 * `dx, dz`: camera minus jhoomar, in the room; `yaw`: how far the jhoomar is turned (radians).
 */
export function tiltAxis(dx: number, dz: number, yaw: number): { x: number; z: number } {
  // Room direction → the jhoomar's turned frame (undo the yaw), then up × direction.
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw)
  const len = Math.hypot(lx, lz)
  if (len < 1e-6) return { x: 1, z: 0 }
  return { x: lz / len, z: -lx / len }
}

/** Rotate point `p` by `angle` about the horizontal unit axis (ax, 0, az) through the origin (Rodrigues). */
export function rotateAboutHorizontalAxis(p: Vec3Like, ax: number, az: number, angle: number): Vec3Like {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dot = ax * p.x + az * p.z
  // a × p with a = (ax, 0, az)
  const cx = -az * p.y
  const cy = az * p.x - ax * p.z
  const cz = ax * p.y
  return {
    x: p.x * c + cx * s + ax * dot * (1 - c),
    y: p.y * c + cy * s,
    z: p.z * c + cz * s + az * dot * (1 - c),
  }
}

/** Next tilt (radians) after one ▲ Top (+1) / ▼ Below (−1) tap. */
export function nextTilt(current: number, step: -1 | 1): number {
  return Math.max(-TILT_MAX, Math.min(TILT_MAX, current + step * TILT_STEP))
}

/** Spin (radians) from a one-finger horizontal drag of `dx` px; same direction as model-viewer (right → turns right). */
export function dragSpin(dx: number, shortSide: number): number {
  return (dx * SPIN_PER_SCREEN) / Math.max(1, shortSide)
}

/** Zoom while pinching: proportional to the finger spread, never below real size, snapping to it near 100 %. */
export function pinchScale(startScale: number, startSpread: number, spread: number): number {
  if (!(startSpread > 0) || !(spread > 0)) return startScale
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (startScale * spread) / startSpread))
  return Math.abs(s - 1) < SCALE_SNAP ? 1 : s
}

/**
 * How far (in the model's own units) to lower the jhoomar's local frame at zoom `scale` so its top stays
 * at the ceiling while model-viewer scales around the floor. 0 at real size; negative when shrinking.
 * World top = scale × (H + lift) must equal H, so lift = H / scale − H; we return −lift.
 */
export function ceilingAnchorShift(heightM: number, scale: number): number {
  if (!(scale > 0) || !(heightM > 0)) return 0
  return heightM - heightM / scale
}

// ---------- model-viewer internals ----------

/** model-viewer keeps its renderer/scene behind Symbols; find them by description (pinned to model-viewer 4.4). */
function internal<T>(el: ModelViewerElement, description: string): T | null {
  let proto: object | null = el
  while (proto) {
    for (const sym of Object.getOwnPropertySymbols(proto)) {
      if (sym.description === description) return (el as unknown as Record<symbol, T>)[sym] ?? null
    }
    proto = Object.getPrototypeOf(proto)
  }
  return null
}

const arRenderer = (el: ModelViewerElement) => internal<{ arRenderer?: ArRendererLike }>(el, "renderer")?.arRenderer ?? null
const sceneOf = (el: ModelViewerElement) => internal<SceneLike>(el, "scene")

/** model-viewer draws a grey footprint box on the floor while placing / touching. It read as a big black box: never draw it. */
function hidePlacementBox(el: ModelViewerElement) {
  const box = arRenderer(el)?.placementBox
  if (!box) return
  if (box.edgeMaterial) box.edgeMaterial.visible = false
  if (box.fillMaterial) box.fillMaterial.visible = false
}

/** Where the phone is and which way it looks, flattened onto the floor. */
type View = { pos: Vec3Like; dir: Vec3Like; right: { x: number; z: number }; forward: { x: number; z: number }; tanHalfFov: number }

function flat(x: number, z: number, fallback: { x: number; z: number }) {
  const len = Math.hypot(x, z)
  return len < 1e-6 ? fallback : { x: x / len, z: z / len }
}

function viewOf(el: ModelViewerElement): View | null {
  const cam = sceneOf(el)?.getCamera?.()
  if (!cam) return null
  const e = cam.matrixWorld.elements
  const p5 = cam.projectionMatrix?.elements[5]
  return {
    pos: { x: e[12], y: e[13], z: e[14] },
    right: flat(e[0], e[2], { x: 1, z: 0 }),
    dir: { x: -e[8], y: -e[9], z: -e[10] },
    // Looking straight down, "forward" along the floor is where the top of the phone points.
    forward: Math.hypot(e[8], e[10]) > 0.2 ? flat(-e[8], -e[10], { x: 0, z: -1 }) : flat(e[4], e[6], { x: 0, z: -1 }),
    tanHalfFov: p5 && p5 > 0 ? 1 / p5 : 0.6,
  }
}

const FLOOR_MARKER = /^floor[\s_]marker/i

type Session = {
  /** scan: looking for the floor · aim: following where the phone points · placed: locked in place. */
  mode: "scan" | "aim" | "placed"
  /** The floor point model-viewer accepted, if any. */
  floorHit: Vec3Like | null
  /** Floor height used for aiming (found, or assumed if no floor was found in time). */
  floorY: number | null
  /** Where it was placed: enforced every frame, so nothing can move it. */
  lock: Vec3Like | null
  /** Facing when placed (double-tap goes back to it). */
  placedYaw: number | null
  /** Spin that keeps going after a flick: radians per ms, slowing down. */
  spinV: number
  /** Tilt about the canopy (radians): where it's heading / where it is / about which axis. */
  tiltGoal: number
  tiltNow: number
  tiltAxis: { x: number; z: number }
}
const sessions = new WeakMap<object, Session>()

function resetSession(s: Session) {
  s.mode = "scan"
  s.floorHit = null
  s.floorY = null
  s.lock = null
  s.placedYaw = null
  s.spinV = 0
  s.tiltGoal = 0
  s.tiltNow = 0
}

/**
 * Patches model-viewer once per element:
 *  - its floor hit test only accepts surfaces well below the phone (skips tables/beds) and remembers the point;
 *  - while aiming, the jhoomar follows the floor point the phone aims at; once placed it is held at that spot;
 *  - zoom is anchored at the canopy, so the jhoomar keeps hanging from the same ceiling point at every size;
 *  - tilt swings it about the canopy to show its top or underneath;
 *  - the floor ring shows only while aiming; the shadow stays on the floor (hidden while tilted);
 *  - a flick keeps the spin going a moment.
 */
function patch(el: ModelViewerElement): Session | null {
  const scene = sceneOf(el)
  const renderer = arRenderer(el)
  if (!scene?.updateTarget || !scene.boundingBox || !scene.goalTarget || !scene.target || !renderer) return null
  const existing = sessions.get(scene)
  if (existing) return existing
  const s: Session = { mode: "scan", floorHit: null, floorY: null, lock: null, placedYaw: null, spinV: 0, tiltGoal: 0, tiltNow: 0, tiltAxis: { x: 1, z: 0 } }
  sessions.set(scene, s)
  const target = scene.target
  const goalTarget = scene.goalTarget
  const box = scene.boundingBox

  // Floor only: skip flat surfaces too close under the phone (table, bed, sofa) and remember the accepted point.
  if (renderer.getHitPoint) {
    const originalHit = renderer.getHitPoint.bind(renderer)
    renderer.getHitPoint = (hit: unknown) => {
      const p = originalHit(hit)
      if (!p || !renderer.isPresenting) return p
      const v = viewOf(el)
      if (v && !isFloorHit(v.pos.y, p.y)) return null
      s.floorHit = { x: p.x, y: p.y, z: p.z }
      return p
    }
  }

  const presenting = () => Boolean(renderer.isPresenting)
  const shift = () => (presenting() ? ceilingAnchorShift(box.max.y - box.min.y, scene.scenePivot?.scale.x ?? 1) : 0)
  const tilted = () => Math.abs(s.tiltNow) > 1e-3 || Math.abs(s.tiltGoal) > 1e-3

  // The floor ring inside the model: the "place it here" point while aiming.
  let marker: { node: Object3DLike; baseY: number; parts: { material: { opacity?: number }; base: number }[] } | null = null
  const findMarker = () => {
    if (marker) return marker
    target.traverse?.((o) => {
      if (marker || !FLOOR_MARKER.test(o.name)) return
      const parts: { material: { opacity?: number }; base: number }[] = []
      o.traverse?.((part) => {
        if (part.material && typeof part.material.opacity === "number") parts.push({ material: part.material, base: part.material.opacity })
      })
      marker = { node: o, baseY: o.position.y, parts }
    })
    return marker
  }
  /** Brighter than in the file (which is kept faint for other AR viewers), so the place point is easy to see. */
  const markerBright = (on: boolean) => {
    for (const part of findMarker()?.parts ?? []) part.material.opacity = on ? Math.min(1, part.base * 2.2 + 0.1) : part.base
  }

  // The shadow is drawn at the bottom of the model; keep it on the floor while zoomed.
  let shadowAsked = 0
  if (scene.setShadowOffset) {
    const originalOffset = scene.setShadowOffset.bind(scene)
    scene.setShadowOffset = (v: number) => {
      shadowAsked = v
      originalOffset(v + shift())
    }
  }
  // model-viewer's default AR shadow (0.8) under a hanging light looks like a black hole; a tilted one would tilt too.
  let intensityAsked = 0
  if (scene.setShadowIntensity) {
    const originalIntensity = scene.setShadowIntensity.bind(scene)
    scene.setShadowIntensity = (v: number) => {
      intensityAsked = v
      originalIntensity(tilted() ? 0 : Math.min(v, AR_SHADOW_MAX))
    }
  }

  let base: { x: number; z: number } | null = null
  let lastShift = 0
  let applied = false
  let wasTilted = false
  let wasAiming = false

  // model-viewer calls updateTarget every AR frame, right after applying this frame's zoom and position.
  const originalUpdate = scene.updateTarget.bind(scene)
  scene.updateTarget = (delta: number) => {
    const m = findMarker()
    if (!presenting()) {
      if (applied || wasAiming) {
        target.quaternion.set(0, 0, 0, 1)
        if (m) {
          m.node.position.y = m.baseY
          m.node.visible = true
        }
        markerBright(false)
      }
      applied = false
      wasAiming = false
      wasTilted = false
      base = null
      lastShift = 0
      s.spinV = 0
      s.tiltGoal = 0
      s.tiltNow = 0
      return originalUpdate(delta)
    }
    hidePlacementBox(el)
    if (!base) base = { x: goalTarget.x, z: goalTarget.z }

    // Where it hangs: following the aim point, or held exactly where it was placed.
    const goal = renderer.goalPosition
    if (goal) {
      if (s.mode === "aim" && s.floorY != null) {
        const v = viewOf(el)
        if (v) {
          const spot = aimSpot(v.pos, v.dir, s.floorY, v.forward)
          goal.x = spot.x
          goal.y = s.floorY
          goal.z = spot.z
        }
      } else if (s.mode === "placed" && s.lock) {
        goal.x = s.lock.x
        goal.y = s.lock.y
        goal.z = s.lock.z
      }
    }

    const dt = Math.min(64, Math.max(0, delta))
    if (s.spinV) {
      renderer.goalYaw += s.spinV * dt
      s.spinV *= Math.exp(-dt / 320)
      if (Math.abs(s.spinV) < 2e-5) s.spinV = 0
    }
    // Ease the tilt towards its goal.
    s.tiltNow = Math.abs(s.tiltGoal - s.tiltNow) < 1e-3 ? s.tiltGoal : s.tiltNow + (s.tiltGoal - s.tiltNow) * (1 - Math.exp(-dt / 90))

    const k = shift()
    if (k !== 0 || s.tiltNow !== 0 || applied) {
      // Straight: ARRenderer's target is the bounding-box bottom (goal y = −min.y); lower it by k for the zoom.
      const p0 = { x: base.x, y: -box.min.y - k, z: base.z }
      // Tilt about the canopy C (top centre): position = p0 + C − R·C keeps C where it was.
      const c = { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 }
      const rc = rotateAboutHorizontalAxis(c, s.tiltAxis.x, s.tiltAxis.z, s.tiltNow)
      goalTarget.x = target.position.x = p0.x + c.x - rc.x
      goalTarget.y = target.position.y = p0.y + c.y - rc.y
      goalTarget.z = target.position.z = p0.z + c.z - rc.z
      const half = Math.sin(s.tiltNow / 2)
      target.quaternion.set(s.tiltAxis.x * half, 0, s.tiltAxis.z * half, Math.cos(s.tiltNow / 2))
      if (m) m.node.position.y = m.baseY + k
      applied = k !== 0 || s.tiltNow !== 0
    }
    // The gold floor ring is the "place it here" point: shown only while aiming. Once placed, the real floor
    // and the soft shadow look more natural than a drawn circle.
    const aiming = s.mode === "aim"
    if (m) m.node.visible = aiming
    if (aiming !== wasAiming) {
      wasAiming = aiming
      markerBright(aiming)
    }
    if (k !== lastShift) {
      lastShift = k
      scene.setShadowOffset?.(shadowAsked)
    }
    if (tilted() !== wasTilted) {
      wasTilted = tilted()
      scene.setShadowIntensity?.(intensityAsked)
    }
    return originalUpdate(delta)
  }
  return s
}

/** Max darkness of the AR floor shadow. */
const AR_SHADOW_MAX = 0.18

/** Hide the jhoomar until it's anchored to the floor, so it never floats along with the phone like a sticker. */
function setModelVisible(el: ModelViewerElement, visible: boolean) {
  const target = sceneOf(el)?.target
  if (target) target.visible = visible
}

/** Put the point under the canopy at (x, z) on the floor straight away (no slide across the room). */
function hangAt(el: ModelViewerElement, x: number, z: number, floorY?: number) {
  const r = arRenderer(el)
  const pivot = sceneOf(el)?.scenePivot
  if (!r?.goalPosition || !pivot) return
  r.goalPosition.x = pivot.position.x = x
  r.goalPosition.z = pivot.position.z = z
  if (floorY !== undefined) r.goalPosition.y = pivot.position.y = floorY
}

// ---------- Layout ----------

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = css
  if (text) node.textContent = text
  return node
}

const GLASS = "background:rgba(22,18,14,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;"
const FONT = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;"

/** Scan animation (phone sweeping over the floor), like the big shopping apps: a picture, not a paragraph. */
const SCAN_CSS = `
@keyframes jh-sweep{0%,100%{transform:translateX(-26px) rotate(-8deg)}50%{transform:translateX(26px) rotate(8deg)}}
@keyframes jh-pulse{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:.8;transform:scale(1)}}
[data-ar-overlay] [data-scan-phone]{animation:jh-sweep 2.2s ease-in-out infinite}
[data-ar-overlay] [data-scan-floor]{animation:jh-pulse 2.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){[data-ar-overlay] [data-scan-phone],[data-ar-overlay] [data-scan-floor]{animation:none}}`
const SCAN_ART = `<svg viewBox="0 0 120 96" width="120" height="96" aria-hidden="true">
  <ellipse data-scan-floor cx="60" cy="80" rx="44" ry="11" fill="none" stroke="#f3dfb5" stroke-width="2" stroke-dasharray="4 5" style="transform-origin:60px 80px"/>
  <g data-scan-phone style="transform-origin:60px 70px">
    <rect x="44" y="10" width="32" height="54" rx="6" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-width="2.5"/>
    <circle cx="60" cy="57" r="2.2" fill="#fff"/>
  </g>
</svg>`

type Pointer = { x: number; y: number }

/**
 * Camera view: a small name pill (top-left; model-viewer's own ✕ sits top-right), a scan animation while
 * looking for the floor, then "Place here"; once placed: ▲ Top / Straight / ▼ Below / Move, and a small
 * zoom % that shows only while pinching. The rest of the screen is the touch surface (see the file comment).
 */
export function attachArOverlay(el: ModelViewerElement, info: () => { title: string; ceilingLabel: string }) {
  const root = h("div", `display:none;position:absolute;inset:0;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;${FONT}`)
  root.dataset.arOverlay = ""
  const style = document.createElement("style")
  style.textContent = SCAN_CSS
  root.appendChild(style)

  const title = h(
    "div",
    `${GLASS}position:absolute;top:calc(14px + env(safe-area-inset-top));left:14px;max-width:calc(100% - 96px);padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none`,
  )

  const scan = h("div", "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none")
  scan.dataset.arScan = ""
  scan.innerHTML = SCAN_ART
  scan.appendChild(h("div", "font-size:13px;font-weight:600;color:#fff;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.7)", t.ar.arScan))

  /** Zoom % — only while pinching. */
  const zoomPill = h(
    "div",
    `${GLASS}position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);padding:5px 12px;border-radius:999px;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .2s;pointer-events:none`,
  )
  zoomPill.dataset.arZoom = ""
  zoomPill.setAttribute("aria-live", "polite")

  // Bottom controls. Touches on a button never reach the gesture layer.
  const bottom = h("div", "position:absolute;left:0;right:0;bottom:calc(22px + env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none")
  const btn = (text: string, label: string, css: string) => {
    const b = h("button", `${FONT}border:0;min-height:44px;border-radius:999px;font-size:14px;font-weight:600;pointer-events:auto;touch-action:manipulation;${css}`, text)
    b.type = "button"
    b.setAttribute("aria-label", label)
    b.addEventListener("pointerdown", (e) => e.stopPropagation())
    return b
  }
  const placeBtn = btn(t.ar.arPlace, t.ar.arPlace, "display:none;padding:0 34px;min-height:52px;font-size:16px;background:#f3dfb5;color:#1c1712;box-shadow:0 4px 18px rgba(0,0,0,.35)")
  placeBtn.dataset.arPlace = ""
  const placedRow = h("div", `${GLASS}display:none;align-items:center;gap:4px;padding:5px;border-radius:999px;pointer-events:auto`)
  placedRow.dataset.arPlaced = ""
  placedRow.addEventListener("pointerdown", (e) => e.stopPropagation())
  const small = "padding:0 14px;background:rgba(255,255,255,.14);color:#fff"
  const topBtn = btn(t.ar.arTiltTop, t.ar.arTiltTopLabel, small)
  const straightBtn = btn(t.ar.arTiltStraight, t.ar.arTiltStraightLabel, small)
  const belowBtn = btn(t.ar.arTiltBelow, t.ar.arTiltBelowLabel, small)
  const moveBtn = btn(t.ar.arMove, t.ar.arMoveLabel, "padding:0 14px;background:#f3dfb5;color:#1c1712")
  placedRow.append(topBtn, straightBtn, belowBtn, moveBtn)
  bottom.append(placeBtn, placedRow)

  root.append(title, scan, zoomPill, bottom)
  el.appendChild(root)
  // No floating cube "AR" button from model-viewer.
  const noArButton = h("span", "display:none")
  noArButton.slot = "ar-button"
  el.appendChild(noArButton)

  // Touches on our layer are ours: stop model-viewer's own AR gestures (drag on floor = move, etc.).
  root.addEventListener("beforexrselect", (e) => e.preventDefault())

  // ----- Gestures -----
  const pointers = new Map<number, Pointer>()
  /** One finger: last position, spin speed (rad/ms) for the flick. */
  let one: { x: number; t: number; v: number; startX: number; startY: number; startT: number; moved: boolean } | null = null
  /** Two fingers: pinch/twist baseline. */
  let two: { spread0: number; scale0: number; angle: number } | null = null
  let lastTap: { x: number; y: number; t: number } | null = null
  let zoomTimer = 0

  const shortSide = () => Math.min(root.clientWidth || innerWidth, root.clientHeight || innerHeight)
  const session = () => patch(el)
  /** Zoom and spin only once it's placed (while aiming, it just follows the phone). */
  const isPlaced = () => session()?.mode === "placed"

  const showZoom = (scale: number) => {
    zoomPill.textContent = `${Math.round(scale * 100)}%`
    zoomPill.style.color = Math.abs(scale - 1) < 1e-3 ? "#f3dfb5" : "#fff"
    zoomPill.style.opacity = "1"
    window.clearTimeout(zoomTimer)
    zoomTimer = window.setTimeout(() => (zoomPill.style.opacity = "0"), 900)
  }

  const startTwo = () => {
    const [a, b] = [...pointers.values()]
    two = {
      spread0: Math.hypot(b.x - a.x, b.y - a.y),
      scale0: Math.max(MIN_SCALE, arRenderer(el)?.goalScale || 1),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }
  const startOne = (p: Pointer) => {
    const now = performance.now()
    one = { x: p.x, t: now, v: 0, startX: p.x, startY: p.y, startT: now, moved: false }
  }

  root.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      root.setPointerCapture(e.pointerId)
    } catch {
      /* not supported */
    }
    const s = session()
    if (s) s.spinV = 0
    if (pointers.size === 1) startOne({ x: e.clientX, y: e.clientY })
    else if (pointers.size === 2) {
      one = null
      startTwo()
    }
  })

  root.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    const r = arRenderer(el)
    if (!isPlaced()) return

    if (pointers.size === 1 && one) {
      // One finger: spin where it hangs (left/right only; it never wanders).
      const now = performance.now()
      if (Math.hypot(p.x - one.startX, p.y - one.startY) > TAP_MOVE) one.moved = true
      const spin = dragSpin(p.x - one.x, shortSide())
      if (r && spin) r.goalYaw += spin
      one.v = one.v * 0.6 + (spin / Math.max(1, now - one.t)) * 0.4
      one.x = p.x
      one.t = now
    } else if (pointers.size === 2 && two) {
      const [a, b] = [...pointers.values()]
      // Pinch → zoom in (never below real size; the canopy stays at the ceiling and the spot never changes).
      const spread = Math.hypot(b.x - a.x, b.y - a.y)
      if (r) {
        r.goalScale = pinchScale(two.scale0, two.spread0, spread)
        showZoom(r.goalScale)
      }
      // Twist → spin (same direction model-viewer uses).
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      let dA = angle - two.angle
      if (dA > Math.PI) dA -= 2 * Math.PI
      if (dA < -Math.PI) dA += 2 * Math.PI
      if (r) r.goalYaw -= dA
      two.angle = angle
    }
  })

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    const before = pointers.size
    pointers.delete(e.pointerId)
    if (before === 1 && one) {
      const now = performance.now()
      if (!isPlaced()) {
        /* aiming: nothing to do */
      } else if (!one.moved && now - one.startT < TAP_TIME) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_GAP && Math.hypot(one.x - lastTap.x, one.startY - lastTap.y) < 40) {
          // Double-tap: real size, hanging straight, facing you as placed.
          lastTap = null
          const r = arRenderer(el)
          const s = session()
          if (s) s.tiltGoal = 0
          if (r) {
            r.goalScale = 1
            if (s?.placedYaw != null) r.goalYaw = s.placedYaw
          }
          showZoom(1)
        } else lastTap = { x: one.x, y: one.startY, t: now }
      } else if (e.type === "pointerup" && now - one.t < 80) {
        const s = session()
        if (s && Math.abs(one.v) > 3e-4) s.spinV = one.v
      }
      one = null
    } else if (before === 2) {
      // One finger left after a pinch: carry on spinning from where it is, without a jump.
      two = null
      const rest = [...pointers.values()][0]
      if (rest) {
        startOne(rest)
        if (one) one.moved = true
      }
    } else if (pointers.size === 2) startTwo()
  }
  root.addEventListener("pointerup", end)
  root.addEventListener("pointercancel", end)

  // ----- Session state: scan → aim → placed -----
  let safety = 0
  const showScan = (on: boolean) => {
    scan.style.display = on ? "flex" : "none"
  }
  const showControls = () => {
    const mode = session()?.mode ?? "scan"
    placeBtn.style.display = mode === "aim" ? "block" : "none"
    placedRow.style.display = mode === "placed" ? "flex" : "none"
  }

  /** Floor found (or given up waiting): show the jhoomar following the floor point the phone aims at. */
  const startAiming = (found: boolean) => {
    const s = session()
    if (!s) {
      // model-viewer internals not reachable: at least show it where model-viewer put it.
      setModelVisible(el, true)
      showScan(false)
      return
    }
    if (s.mode !== "scan") return
    window.clearTimeout(safety)
    const v = viewOf(el)
    s.floorY = found && s.floorHit ? s.floorHit.y : v ? v.pos.y - FALLBACK_PHONE_HEIGHT_M : (arRenderer(el)?.goalPosition?.y ?? 0)
    s.mode = "aim"
    if (v) {
      // Start at the aim point straight away (no slide across the room from model-viewer's own spot).
      const spot = aimSpot(v.pos, v.dir, s.floorY, v.forward)
      hangAt(el, spot.x, spot.z, s.floorY)
    }
    setModelVisible(el, true)
    showScan(false)
    showControls()
  }

  /** "Place here": fix it at this spot. From now on nothing moves it. */
  const place = () => {
    const s = session()
    const r = arRenderer(el)
    if (!s || s.mode !== "aim" || !r?.goalPosition) return
    s.lock = { x: r.goalPosition.x, y: r.goalPosition.y, z: r.goalPosition.z }
    hangAt(el, s.lock.x, s.lock.z, s.lock.y)
    s.placedYaw = r.goalYaw
    s.mode = "placed"
    showControls()
    navigator.vibrate?.(25)
  }

  /** "Move": back to aiming, at real size and hanging straight. */
  const move = () => {
    const s = session()
    const r = arRenderer(el)
    if (!s || s.mode !== "placed") return
    s.mode = "aim"
    s.lock = null
    s.tiltGoal = 0
    s.spinV = 0
    if (r) r.goalScale = 1
    showControls()
  }

  const tilt = (step: -1 | 0 | 1) => {
    const s = session()
    if (!s || s.mode !== "placed") return
    if (step === 0) {
      s.tiltGoal = 0
      return
    }
    // Pick the swing direction from where the viewer stands now (only when starting from straight).
    if (Math.abs(s.tiltNow) < 1e-3 && Math.abs(s.tiltGoal) < 1e-3) {
      const v = viewOf(el)
      const pivot = sceneOf(el)?.scenePivot
      if (v && pivot) {
        const q = pivot.quaternion
        s.tiltAxis = tiltAxis(v.pos.x - pivot.position.x, v.pos.z - pivot.position.z, 2 * Math.atan2(q.y, q.w))
      }
    }
    s.tiltGoal = nextTilt(s.tiltGoal, step)
  }

  placeBtn.addEventListener("click", place)
  moveBtn.addEventListener("click", move)
  topBtn.addEventListener("click", () => tilt(1))
  belowBtn.addEventListener("click", () => tilt(-1))
  straightBtn.addEventListener("click", () => tilt(0))

  el.addEventListener("ar-status", (e) => {
    const status = (e as CustomEvent<{ status: string }>).detail.status
    if (status === "session-started") {
      const { title: name, ceilingLabel } = info()
      title.textContent = ceilingLabel ? `${name} · ${ceilingLabel}` : name
      root.style.display = "block"
      pointers.clear()
      one = null
      two = null
      lastTap = null
      zoomPill.style.opacity = "0"
      const s = patch(el)
      if (s) resetSession(s)
      hidePlacementBox(el)
      setModelVisible(el, false)
      showScan(true)
      showControls()
      // Never leave the jhoomar hidden if the floor isn't found.
      window.clearTimeout(safety)
      safety = window.setTimeout(() => startAiming(false), 15000)
    } else if (status === "object-placed") {
      startAiming(true)
    } else if (status === "not-presenting" || status === "failed") {
      root.style.display = "none"
      setModelVisible(el, true)
      window.clearTimeout(safety)
      window.clearTimeout(zoomTimer)
    }
  })

  el.addEventListener("ar-tracking", (e) => {
    const tracking = (e as CustomEvent<{ status: string }>).detail.status
    showScan(tracking === "not-tracking" || (session()?.mode ?? "scan") === "scan")
  })

  return { root }
}
