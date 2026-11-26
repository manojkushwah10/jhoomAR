"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera view for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it part of
 * model-viewer's AR "DOM overlay", drawn on top of the camera.
 *
 * A jhoomar behaves like the real thing: it hangs straight down from one fixed point on the ceiling.
 *  - Placement: on the floor where the phone points (within easy viewing distance), never on a table or bed,
 *    and never "inside" a wall. model-viewer on its own puts it ~2 × the model's size in front of the phone
 *    — for a floor-to-ceiling hanging GLB that's ~3.5 m, i.e. at or behind the far wall — and takes the
 *    first flat surface it sees as the floor.
 *  - One finger left/right: spins it where it hangs (it never wanders off by accident).
 *  - Two fingers: slide to move it along the room, pinch to zoom (it stays hanging from the ceiling), twist to spin.
 *  - Double-tap: real size, facing you as placed.
 *  - To see it from below or above, walk under it and look up — like a real one. It never tilts.
 *
 * model-viewer's own AR touch handling is switched off by cancelling `beforexrselect` on our full-screen layer;
 * we drive its internal scene/renderer instead (private API, reached through its `renderer`/`scene` Symbols,
 * pinned to model-viewer 4.4 — re-check on upgrade).
 */

type Vec3Like = { x: number; y: number; z: number }
type MaterialLike = { visible: boolean }
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
  traverse?: (fn: (o: Object3DLike) => void) => void
}
type CameraLike = { matrixWorld: { elements: number[] }; projectionMatrix?: { elements: number[] } }
type SceneLike = {
  scenePivot?: { scale: { x: number }; position: Vec3Like }
  target?: Object3DLike
  goalTarget?: Vec3Like
  boundingBox?: { min: Vec3Like; max: Vec3Like }
  getCamera?: () => CameraLike
  updateTarget?: (delta: number) => boolean
  setShadowIntensity?: (v: number) => void
  setShadowOffset?: (v: number) => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
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

/** Spin (radians) from a one-finger horizontal drag of `dx` px; same direction as model-viewer (right → turns right). */
export function dragSpin(dx: number, shortSide: number): number {
  return (dx * SPIN_PER_SCREEN) / Math.max(1, shortSide)
}

/** Zoom while pinching: proportional to the finger spread, clamped, snapping to real size near 100 %. */
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
type View = { pos: Vec3Like; right: { x: number; z: number }; forward: { x: number; z: number }; tanHalfFov: number }

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
    forward: flat(-e[8], -e[10], { x: 0, z: -1 }),
    tanHalfFov: p5 && p5 > 0 ? 1 / p5 : 0.6,
  }
}

const FLOOR_MARKER = /^floor[\s_]marker/i

type Session = {
  /** The floor point model-viewer accepted, if any. */
  floorHit: Vec3Like | null
  /** Facing when placed (double-tap goes back to it). */
  placedYaw: number | null
  /** Spin that keeps going after a flick: radians per ms, slowing down. */
  spinV: number
}
const sessions = new WeakMap<object, Session>()

/**
 * Patches model-viewer once per element:
 *  - its floor hit test only accepts surfaces well below the phone (skips tables/beds) and remembers the point;
 *  - zoom is anchored at the canopy, so the jhoomar keeps hanging from the same ceiling point at every size,
 *    with the (hidden) floor marker and shadow kept on the floor;
 *  - a flick keeps the spin going a moment.
 */
function patch(el: ModelViewerElement): Session | null {
  const scene = sceneOf(el)
  const renderer = arRenderer(el)
  if (!scene?.updateTarget || !scene.boundingBox || !scene.goalTarget || !scene.target || !renderer) return null
  const existing = sessions.get(scene)
  if (existing) return existing
  const s: Session = { floorHit: null, placedYaw: null, spinV: 0 }
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

  let marker: { node: Object3DLike; baseY: number } | null = null
  const findMarker = () => {
    if (marker) return marker
    target.traverse?.((o) => {
      if (!marker && FLOOR_MARKER.test(o.name)) marker = { node: o, baseY: o.position.y }
    })
    return marker
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
  // model-viewer's default AR shadow (0.8) under a hanging light looks like a black hole.
  if (scene.setShadowIntensity) {
    const originalIntensity = scene.setShadowIntensity.bind(scene)
    scene.setShadowIntensity = (v: number) => originalIntensity(Math.min(v, AR_SHADOW_MAX))
  }

  let base: { x: number; z: number } | null = null
  let lastShift = 0
  let applied = false

  // model-viewer calls updateTarget every AR frame, right after applying this frame's zoom and position.
  const originalUpdate = scene.updateTarget.bind(scene)
  scene.updateTarget = (delta: number) => {
    const m = findMarker()
    if (!presenting()) {
      if (applied && m) {
        m.node.position.y = m.baseY
        m.node.visible = true
      }
      applied = false
      base = null
      lastShift = 0
      s.spinV = 0
      return originalUpdate(delta)
    }
    hidePlacementBox(el)
    if (!base) base = { x: goalTarget.x, z: goalTarget.z }

    const dt = Math.min(64, Math.max(0, delta))
    if (s.spinV) {
      renderer.goalYaw += s.spinV * dt
      s.spinV *= Math.exp(-dt / 320)
      if (Math.abs(s.spinV) < 2e-5) s.spinV = 0
    }

    const k = shift()
    if (k !== 0 || applied) {
      // ARRenderer's target is the bounding-box bottom (goal y = −min.y); lower it by k for the zoom.
      goalTarget.x = base.x
      goalTarget.y = -box.min.y - k
      goalTarget.z = base.z
      target.position.x = goalTarget.x
      target.position.y = goalTarget.y
      target.position.z = goalTarget.z
      if (m) m.node.position.y = m.baseY + k
      applied = k !== 0
    }
    // The floor marker only exists so other AR viewers put the canopy at the ceiling. Here the jhoomar is
    // already placed, so hide it: the real floor and the soft shadow look more natural than a drawn circle.
    if (m) m.node.visible = false
    if (k !== lastShift) {
      lastShift = k
      scene.setShadowOffset?.(shadowAsked)
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
 * Camera view: nothing over the room except a small name pill (top-left; model-viewer's own ✕ sits top-right),
 * a scan animation while looking for the floor, and a small zoom % that shows only while pinching.
 * The whole screen is the touch surface (see the file comment for the gestures).
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

  root.append(title, scan, zoomPill)
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
  /** Two fingers: pinch/twist/slide baseline. */
  let two: { spread0: number; scale0: number; angle: number; midX: number; midY: number } | null = null
  let lastTap: { x: number; y: number; t: number } | null = null
  let zoomTimer = 0

  const shortSide = () => Math.min(root.clientWidth || innerWidth, root.clientHeight || innerHeight)
  const session = () => patch(el)

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
      scale0: arRenderer(el)?.goalScale || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
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

    if (pointers.size === 1 && one) {
      // One finger: spin where it hangs (left/right only; it never tilts or wanders).
      const now = performance.now()
      if (Math.hypot(p.x - one.startX, p.y - one.startY) > TAP_MOVE) one.moved = true
      const spin = dragSpin(p.x - one.x, shortSide())
      if (r && spin) r.goalYaw += spin
      one.v = one.v * 0.6 + (spin / Math.max(1, now - one.t)) * 0.4
      one.x = p.x
      one.t = now
    } else if (pointers.size === 2 && two) {
      const [a, b] = [...pointers.values()]
      // Pinch → zoom (model-viewer's own AR scale; the canopy stays at the ceiling).
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
      // Slide → move it along the room (as seen from the phone), kept within easy viewing distance.
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const goal = r?.goalPosition
      const v = viewOf(el)
      if (goal && v) {
        const dist = Math.max(0.5, Math.hypot(goal.x - v.pos.x, goal.y - v.pos.y, goal.z - v.pos.z))
        const metresPerPx = (2 * dist * v.tanHalfFov) / Math.max(1, root.clientHeight || innerHeight)
        const mx = (midX - two.midX) * metresPerPx
        const my = -(midY - two.midY) * metresPerPx
        const next = { x: goal.x + v.right.x * mx + v.forward.x * my, z: goal.z + v.right.z * mx + v.forward.z * my }
        const dx = next.x - v.pos.x
        const dz = next.z - v.pos.z
        const d = Math.hypot(dx, dz)
        const k = d > MAX_PLACE_M + 1 ? (MAX_PLACE_M + 1) / d : 1
        goal.x = v.pos.x + dx * k
        goal.z = v.pos.z + dz * k
      }
      two.midX = midX
      two.midY = midY
    }
  })

  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    const before = pointers.size
    pointers.delete(e.pointerId)
    if (before === 1 && one) {
      const now = performance.now()
      if (!one.moved && now - one.startT < TAP_TIME) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_GAP && Math.hypot(one.x - lastTap.x, one.startY - lastTap.y) < 40) {
          // Double-tap: real size, facing you as placed.
          lastTap = null
          const r = arRenderer(el)
          const s = session()
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

  // ----- Session state -----
  // Placed happens once per session; losing tracking only brings the scan animation back.
  let safety = 0
  let placed = false
  const showScan = (on: boolean) => {
    scan.style.display = on ? "flex" : "none"
  }
  const markPlaced = (found: boolean) => {
    if (placed) return
    placed = true
    window.clearTimeout(safety)
    const v = viewOf(el)
    const s = session()
    if (v) {
      if (found && s?.floorHit) {
        // Hang it above the floor point the phone aims at, within easy viewing distance.
        const spot = placementSpot(v.pos, s.floorHit, v.forward)
        hangAt(el, spot.x, spot.z, s.floorHit.y)
      } else {
        // No floor found in time: a typical spot in front, at a typical floor height.
        hangAt(el, v.pos.x + v.forward.x * FALLBACK_DISTANCE_M, v.pos.z + v.forward.z * FALLBACK_DISTANCE_M, v.pos.y - FALLBACK_PHONE_HEIGHT_M)
      }
    }
    const r = arRenderer(el)
    if (s && r) s.placedYaw = r.goalYaw
    setModelVisible(el, true)
    showScan(false)
    navigator.vibrate?.(25)
  }

  el.addEventListener("ar-status", (e) => {
    const status = (e as CustomEvent<{ status: string }>).detail.status
    if (status === "session-started") {
      const { title: name, ceilingLabel } = info()
      title.textContent = ceilingLabel ? `${name} · ${ceilingLabel}` : name
      root.style.display = "block"
      placed = false
      pointers.clear()
      one = null
      two = null
      lastTap = null
      zoomPill.style.opacity = "0"
      const s = patch(el)
      if (s) {
        s.floorHit = null
        s.placedYaw = null
        s.spinV = 0
      }
      hidePlacementBox(el)
      setModelVisible(el, false)
      showScan(true)
      // Never leave the jhoomar hidden if the floor isn't found.
      safety = window.setTimeout(() => markPlaced(false), 15000)
    } else if (status === "object-placed") {
      markPlaced(true)
    } else if (status === "not-presenting" || status === "failed") {
      root.style.display = "none"
      setModelVisible(el, true)
      window.clearTimeout(safety)
      window.clearTimeout(zoomTimer)
    }
  })

  el.addEventListener("ar-tracking", (e) => {
    const tracking = (e as CustomEvent<{ status: string }>).detail.status
    showScan(tracking === "not-tracking" || !placed)
  })

  return { root }
}
