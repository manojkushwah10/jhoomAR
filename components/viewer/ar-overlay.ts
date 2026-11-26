"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera view for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it part of
 * model-viewer's AR "DOM overlay", drawn on top of the camera.
 *
 * No buttons: the jhoomar is handled with the fingers, like a 3D model viewer
 *  - one finger: turn it any way — left/right spins it, up/down swings it to show its top or underneath
 *    (it keeps turning a little after you let go);
 *  - two fingers: pinch to zoom, twist to spin, slide to move it around the room;
 *  - double-tap: real size, hanging straight again.
 * Every turn and zoom happens about the canopy, so it keeps hanging from the same point on the ceiling.
 *
 * model-viewer's own AR touch handling (drag on the floor = move, twist = spin) is switched off by cancelling
 * `beforexrselect` on our full-screen layer; we drive its internal scene/renderer instead (private API,
 * reached through its `renderer`/`scene` Symbols, pinned to model-viewer 4.4 — re-check on upgrade).
 */

type Vec3Like = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }
type QuatLike = Quat & { set: (x: number, y: number, z: number, w: number) => unknown }
type MaterialLike = { visible: boolean }
type ArRendererLike = {
  goalScale: number
  isPresenting?: boolean
  goalPosition?: Vec3Like
  placementBox?: { edgeMaterial?: MaterialLike; fillMaterial?: MaterialLike } | null
}
type Object3DLike = {
  name: string
  visible: boolean
  position: Vec3Like
  quaternion: QuatLike
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

const MIN_SCALE = 0.25
const MAX_SCALE = 4
/** Pinching to within 6 % of real size snaps to exactly real size. */
const SCALE_SNAP = 0.06
/** One-finger drag: dragging across the short side of the screen turns it this far (radians). */
const TURN_PER_SCREEN = Math.PI * 1.2
/** Taps: max movement (px) and time (ms) for a tap, max gap (ms) between the two taps of a double-tap. */
const TAP_MOVE = 12
const TAP_TIME = 280
const DOUBLE_TAP_GAP = 320

// ---------- Small quaternion helpers (pure, unit-tested) ----------

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 }

export function quatAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const len = Math.hypot(ax, ay, az) || 1
  const s = Math.sin(angle / 2) / len
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) }
}

/** a · b (apply b first, then a). */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

export const quatConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
}

/** Rotate vector v by unit quaternion q. */
export function quatRotate(q: Quat, v: Vec3Like): Vec3Like {
  // v' = v + 2w(u × v) + 2u × (u × v), u = (x, y, z)
  const cx = q.y * v.z - q.z * v.y
  const cy = q.z * v.x - q.x * v.z
  const cz = q.x * v.y - q.y * v.x
  return {
    x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
    y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
    z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx),
  }
}

/** Spherical interpolation from a to b by t (0…1), shortest way round. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let { x, y, z, w } = b
  let cos = a.x * x + a.y * y + a.z * z + a.w * w
  if (cos < 0) {
    cos = -cos
    x = -x
    y = -y
    z = -z
    w = -w
  }
  if (cos > 0.9995) {
    return quatNormalize({ x: a.x + (x - a.x) * t, y: a.y + (y - a.y) * t, z: a.z + (z - a.z) * t, w: a.w + (w - a.w) * t })
  }
  const theta = Math.acos(Math.min(1, cos))
  const sin = Math.sin(theta)
  const ka = Math.sin((1 - t) * theta) / sin
  const kb = Math.sin(t * theta) / sin
  return { x: a.x * ka + x * kb, y: a.y * ka + y * kb, z: a.z * ka + z * kb, w: a.w * ka + w * kb }
}

/** Angle (radians) between two orientations. */
export const quatAngle = (a: Quat, b: Quat) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)))

/**
 * Turn from a one-finger drag of (dx, dy) screen pixels, in room coordinates (like an orbit viewer):
 * left/right spins about the room's vertical; down swings the top towards the viewer (shows the top), up shows
 * the underneath. `right` = the camera's right direction on the floor (x, z); `shortSide` = screen short side, px.
 */
export function dragTurn(dx: number, dy: number, shortSide: number, right: { x: number; z: number }): Quat {
  const rate = TURN_PER_SCREEN / Math.max(1, shortSide)
  const spin = quatAxisAngle(0, 1, 0, dx * rate)
  const swing = quatAxisAngle(right.x, 0, right.z, dy * rate)
  return quatMul(swing, spin)
}

/** Zoom while pinching: proportional to the finger spread, clamped, snapping to real size near 100 %. */
export function pinchScale(startScale: number, startSpread: number, spread: number): number {
  if (!(startSpread > 0) || !(spread > 0)) return startScale
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (startScale * spread) / startSpread))
  return Math.abs(s - 1) < SCALE_SNAP ? 1 : s
}

/** True when the orientation still hangs straight down (only spun about the vertical). */
export function isUpright(q: Quat): boolean {
  return quatRotate(q, { x: 0, y: 1, z: 0 }).y > 0.9997
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

const FLOOR_MARKER = /^floor[\s_]marker/i

/** Where the phone is and which way it looks, flattened onto the floor. */
type View = { pos: Vec3Like; right: { x: number; z: number }; forward: { x: number; z: number }; tanHalfFov: number }

type PoseControl = {
  /** Add a turn (room coordinates) to where it's heading. */
  turn: (q: Quat) => void
  /** Keep turning after the finger lifts: px per ms, slowing down. */
  fling: (vx: number, vy: number) => void
  stopFling: () => void
  /** Back to hanging straight (animated). */
  straighten: () => void
  isTilted: () => boolean
  view: () => View | null
  reset: () => void
}
const poses = new WeakMap<object, PoseControl>()

function flat(x: number, z: number, fallback: { x: number; z: number }) {
  const len = Math.hypot(x, z)
  return len < 1e-6 ? fallback : { x: x / len, z: z / len }
}

/**
 * Takes over the jhoomar's pose inside model-viewer's AR frame (patches the scene once per element):
 *  - any turn, about the canopy (top centre), so it keeps hanging from the same ceiling point;
 *  - zoom anchored at the canopy too;
 *  - the floor marker stays hidden and the shadow stays on the floor (hidden while tilted off vertical).
 */
function poseControl(el: ModelViewerElement): PoseControl | null {
  const scene = sceneOf(el)
  if (!scene?.updateTarget || !scene.boundingBox || !scene.goalTarget || !scene.target) return null
  const existing = poses.get(scene)
  if (existing) return existing
  const target = scene.target
  const goalTarget = scene.goalTarget
  const box = scene.boundingBox

  const presenting = () => Boolean(arRenderer(el)?.isPresenting)
  const shift = () => (presenting() ? ceilingAnchorShift(box.max.y - box.min.y, scene.scenePivot?.scale.x ?? 1) : 0)

  /** Extra turn in room coordinates: where it's heading and where it is now (eased). */
  let goalQ: Quat = IDENTITY
  let nowQ: Quat = IDENTITY
  let flingV: { x: number; y: number } | null = null
  /** Where ARRenderer put the target (x, z) at the start of this AR session. */
  let base: { x: number; z: number } | null = null
  let lastShift = 0
  let poseApplied = false

  // The floor marker lives inside the model, so it moves with it; keep it on the floor (and hidden).
  let marker: { node: Object3DLike; baseY: number } | null = null
  const findMarker = () => {
    if (marker) return marker
    target.traverse?.((o) => {
      if (!marker && FLOOR_MARKER.test(o.name)) marker = { node: o, baseY: o.position.y }
    })
    return marker
  }

  // The shadow is drawn at the bottom of the model too; keep it on the floor (model-viewer also sets this
  // while dropping the model, so add our part to whatever it asks for).
  let shadowAsked = 0
  if (scene.setShadowOffset) {
    const originalOffset = scene.setShadowOffset.bind(scene)
    scene.setShadowOffset = (v: number) => {
      shadowAsked = v
      originalOffset(v + shift())
    }
  }

  const isTilted = () => !isUpright(nowQ) || !isUpright(goalQ)
  let shadowWasTilted = false

  const view = (): View | null => {
    const cam = scene.getCamera?.()
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

  const restoreStraight = () => {
    target.quaternion.set(0, 0, 0, 1)
    const m = findMarker()
    if (m) {
      m.node.position.y = m.baseY
      m.node.visible = true
    }
    poseApplied = false
  }

  // model-viewer calls updateTarget every AR frame, right after applying this frame's zoom, position and yaw.
  const originalUpdate = scene.updateTarget.bind(scene)
  scene.updateTarget = (delta: number) => {
    if (!presenting()) {
      // Outside AR, leave the target alone (model-viewer restores the normal 3D view's target itself).
      if (poseApplied) restoreStraight()
      base = null
      lastShift = 0
      return originalUpdate(delta)
    }
    hidePlacementBox(el)
    if (!base) base = { x: goalTarget.x, z: goalTarget.z }
    const dt = Math.min(64, Math.max(0, delta))

    // Keep turning after a flick, slowing down.
    if (flingV) {
      const v = view()
      if (v) goalQ = quatNormalize(quatMul(dragTurn(flingV.x * dt, flingV.y * dt, Math.min(innerWidth, innerHeight), v.right), goalQ))
      const decay = Math.exp(-dt / 320)
      flingV = { x: flingV.x * decay, y: flingV.y * decay }
      if (Math.hypot(flingV.x, flingV.y) < 0.01) flingV = null
    }
    // Ease towards the goal (fast enough to feel attached to the finger, smooth enough to hide jitter).
    nowQ = quatAngle(nowQ, goalQ) < 1e-4 ? goalQ : quatSlerp(nowQ, goalQ, 1 - Math.exp(-dt / 45))

    const k = shift()
    const pivotQ = scene.scenePivot?.quaternion ?? IDENTITY
    // The model's own frame turns with model-viewer's pivot (its yaw): turn = P⁻¹ · Q · P.
    const turn = quatNormalize(quatMul(quatConj(pivotQ), quatMul(nowQ, pivotQ)))
    const turned = quatAngle(turn, IDENTITY) > 1e-5
    if (k !== 0 || turned || poseApplied) {
      // Straight: ARRenderer's target is the bounding-box bottom (goal y = −min.y); lower it by k for the zoom.
      const p0 = { x: base.x, y: -box.min.y - k, z: base.z }
      // Turn about the canopy C (top centre): position = p0 + C − R·C keeps C where it was.
      const c = { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 }
      const rc = quatRotate(turn, c)
      const pos = { x: p0.x + c.x - rc.x, y: p0.y + c.y - rc.y, z: p0.z + c.z - rc.z }
      goalTarget.x = pos.x
      goalTarget.y = pos.y
      goalTarget.z = pos.z
      target.position.x = pos.x
      target.position.y = pos.y
      target.position.z = pos.z
      target.quaternion.set(turn.x, turn.y, turn.z, turn.w)
      const m = findMarker()
      if (m) m.node.position.y = m.baseY + k
      poseApplied = k !== 0 || turned
    }
    // The floor marker only exists so other AR viewers put the canopy at the ceiling. Here the jhoomar is
    // already placed, so hide it: the real floor and the soft shadow look more natural than a drawn circle.
    const m = findMarker()
    if (m) m.node.visible = false
    if (k !== lastShift) {
      lastShift = k
      scene.setShadowOffset?.(shadowAsked)
    }
    const tilted = isTilted()
    if (tilted !== shadowWasTilted) {
      shadowWasTilted = tilted
      refreshShadow(scene)
    }
    return originalUpdate(delta)
  }

  const control: PoseControl = {
    turn(q) {
      goalQ = quatNormalize(quatMul(q, goalQ))
    },
    fling(vx, vy) {
      flingV = Math.hypot(vx, vy) > 0.15 ? { x: vx, y: vy } : null
    },
    stopFling() {
      flingV = null
    },
    straighten() {
      flingV = null
      goalQ = IDENTITY
    },
    isTilted,
    view,
    reset() {
      goalQ = IDENTITY
      nowQ = IDENTITY
      flingV = null
      base = null
      lastShift = 0
      shadowWasTilted = false
      restoreStraight()
    },
  }
  poses.set(scene, control)
  return control
}

/** Max darkness of model-viewer's AR floor shadow. Its default (0.8) under a hanging light looks like a black hole. */
const AR_SHADOW_MAX = 0.18

/** Last shadow strength model-viewer asked for, so it can be put back after a tilt. */
const shadowAsked = new WeakMap<object, number>()

/** Clamp the AR shadow, and hide it while the jhoomar is tilted (the shadow would tilt with it). */
function softenShadow(el: ModelViewerElement) {
  const scene = sceneOf(el)
  if (!scene?.setShadowIntensity || shadowAsked.has(scene)) return
  const original = scene.setShadowIntensity.bind(scene)
  shadowAsked.set(scene, 0)
  scene.setShadowIntensity = (v: number) => {
    shadowAsked.set(scene, v)
    original(poses.get(scene)?.isTilted() ? 0 : Math.min(v, AR_SHADOW_MAX))
  }
}

function refreshShadow(scene: SceneLike) {
  const v = shadowAsked.get(scene)
  if (v !== undefined) scene.setShadowIntensity?.(v)
}

/** Hide the jhoomar until it's anchored to the floor, so it never floats along with the phone like a sticker. */
function setModelVisible(el: ModelViewerElement, visible: boolean) {
  const target = sceneOf(el)?.target
  if (target) target.visible = visible
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
  /** One finger: last position, velocity (px/ms) for the flick. */
  let one: { x: number; y: number; t: number; vx: number; vy: number; startX: number; startY: number; startT: number; moved: boolean } | null = null
  /** Two fingers: pinch/twist/slide baseline. */
  let two: { spread0: number; scale0: number; angle: number; midX: number; midY: number } | null = null
  let lastTap: { x: number; y: number; t: number } | null = null
  let zoomTimer = 0

  const pose = () => poseControl(el)
  const shortSide = () => Math.min(root.clientWidth || innerWidth, root.clientHeight || innerHeight)

  const showZoom = (scale: number) => {
    zoomPill.textContent = `${Math.round(scale * 100)}%`
    zoomPill.style.color = Math.abs(scale - 1) < 1e-3 ? "#f3dfb5" : "#fff"
    zoomPill.style.opacity = "1"
    window.clearTimeout(zoomTimer)
    zoomTimer = window.setTimeout(() => (zoomPill.style.opacity = "0"), 900)
  }

  const startTwo = () => {
    const [a, b] = [...pointers.values()]
    const r = arRenderer(el)
    two = {
      spread0: Math.hypot(b.x - a.x, b.y - a.y),
      scale0: r?.goalScale || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    }
  }
  const startOne = (p: Pointer) => {
    const now = performance.now()
    one = { x: p.x, y: p.y, t: now, vx: 0, vy: 0, startX: p.x, startY: p.y, startT: now, moved: false }
  }

  root.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      root.setPointerCapture(e.pointerId)
    } catch {
      /* not supported */
    }
    pose()?.stopFling()
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

    if (pointers.size === 1 && one) {
      const now = performance.now()
      const dx = p.x - one.x
      const dy = p.y - one.y
      if (Math.hypot(p.x - one.startX, p.y - one.startY) > TAP_MOVE) one.moved = true
      const c = pose()
      const v = c?.view()
      if (c && v && (dx || dy)) c.turn(dragTurn(dx, dy, shortSide(), v.right))
      const dt = Math.max(1, now - one.t)
      // Smoothed finger speed, for the flick when it lifts.
      one.vx = one.vx * 0.6 + (dx / dt) * 0.4
      one.vy = one.vy * 0.6 + (dy / dt) * 0.4
      one.x = p.x
      one.y = p.y
      one.t = now
    } else if (pointers.size === 2 && two) {
      const [a, b] = [...pointers.values()]
      const r = arRenderer(el)
      const c = pose()
      const v = c?.view()
      // Pinch → zoom (model-viewer's own AR scale; the canopy stays at the ceiling).
      const spread = Math.hypot(b.x - a.x, b.y - a.y)
      if (r) {
        r.goalScale = pinchScale(two.scale0, two.spread0, spread)
        showZoom(r.goalScale)
      }
      // Twist → spin about the vertical (same direction model-viewer uses).
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      let dA = angle - two.angle
      if (dA > Math.PI) dA -= 2 * Math.PI
      if (dA < -Math.PI) dA += 2 * Math.PI
      if (c && Math.abs(dA) > 1e-4) c.turn(quatAxisAngle(0, 1, 0, -dA))
      two.angle = angle
      // Slide → move it around the room (along the floor, as seen from the phone).
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const goal = r?.goalPosition
      if (goal && v) {
        const dist = Math.max(0.5, Math.hypot(goal.x - v.pos.x, goal.y - v.pos.y, goal.z - v.pos.z))
        const metresPerPx = (2 * dist * v.tanHalfFov) / Math.max(1, root.clientHeight || innerHeight)
        const mx = (midX - two.midX) * metresPerPx
        const my = -(midY - two.midY) * metresPerPx
        goal.x += v.right.x * mx + v.forward.x * my
        goal.z += v.right.z * mx + v.forward.z * my
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
      const isTap = !one.moved && now - one.startT < TAP_TIME
      if (isTap) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_GAP && Math.hypot(one.x - lastTap.x, one.y - lastTap.y) < 40) {
          // Double-tap: real size, hanging straight.
          lastTap = null
          const r = arRenderer(el)
          if (r) r.goalScale = 1
          showZoom(1)
          pose()?.straighten()
        } else lastTap = { x: one.x, y: one.y, t: now }
      } else if (e.type === "pointerup" && now - one.t < 80) {
        pose()?.fling(one.vx, one.vy)
      }
      one = null
    } else if (before === 2) {
      // One finger left after a pinch: carry on turning from where it is, without a jump.
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
  const markPlaced = () => {
    if (placed) return
    placed = true
    window.clearTimeout(safety)
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
      hidePlacementBox(el)
      softenShadow(el)
      poseControl(el)?.reset()
      setModelVisible(el, false)
      showScan(true)
      // Never leave the jhoomar hidden if the "placed" signal doesn't come.
      safety = window.setTimeout(markPlaced, 12000)
    } else if (status === "object-placed") {
      markPlaced()
    } else if (status === "not-presenting" || status === "failed") {
      root.style.display = "none"
      poseControl(el)?.reset()
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
