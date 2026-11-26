"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera view for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it part of
 * model-viewer's AR "DOM overlay", drawn on top of the camera. Layout: see `attachArOverlay`.
 *
 * Zoom buttons drive model-viewer's own AR scale (the same value pinching changes), so buttons and
 * pinch stay in sync and the size button always returns to exactly 100 %.
 *
 * model-viewer scales around the bottom of the bounding box, which for our hanging GLBs is the floor
 * marker, so a zoomed jhoomar would grow up through the ceiling or sink towards the floor; and it can only
 * turn the model around the vertical axis. `poseControl` anchors zoom at the canopy and adds a tilt about it.
 */

type ArRendererLike = { goalScale: number; isPresenting?: boolean }
type Vec3Like = { x: number; y: number; z: number }
type QuatLike = { x: number; y: number; z: number; w: number; set: (x: number, y: number, z: number, w: number) => unknown }
type Object3DLike = {
  name: string
  visible: boolean
  position: Vec3Like
  quaternion: QuatLike
  traverse?: (fn: (o: Object3DLike) => void) => void
}
type SceneLike = {
  scenePivot?: { scale: { x: number }; position: Vec3Like; quaternion: QuatLike }
  target?: Object3DLike
  goalTarget?: Vec3Like
  boundingBox?: { min: Vec3Like; max: Vec3Like }
  getCamera?: () => { matrixWorld: { elements: number[] } }
  updateTarget?: (delta: number) => boolean
  setShadowIntensity?: (v: number) => void
  setShadowOffset?: (v: number) => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
/** Tilt ("see the top / see underneath"): one tap = 30°, at most 90° either way. */
const TILT_STEP = Math.PI / 6
const TILT_MAX = Math.PI / 2

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
const currentScale = (el: ModelViewerElement) => sceneOf(el)?.scenePivot?.scale.x ?? 1

/**
 * How far (in the model's own units) to lower the jhoomar's local frame at zoom `scale` so its top stays
 * at the ceiling while model-viewer scales around the floor. 0 at real size; negative when shrinking.
 * World top = scale × (H + lift) must equal H, so lift = H / scale − H; we return −lift.
 */
export function ceilingAnchorShift(heightM: number, scale: number): number {
  if (!(scale > 0) || !(heightM > 0)) return 0
  return heightM - heightM / scale
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

const FLOOR_MARKER = /^floor[\s_]marker/i

type PoseControl = {
  /** Step the tilt: +1 = show more of the top, −1 = more of the underneath, 0 = hang straight again. */
  tilt: (step: -1 | 0 | 1) => void
  isTilted: () => boolean
  reset: () => void
}
const poses = new WeakMap<object, PoseControl>()

/**
 * Takes over the jhoomar's pose inside model-viewer's AR frame (patches the scene once per element):
 *  - zoom is anchored at the canopy, so the jhoomar keeps hanging from the same ceiling point at every size;
 *  - tilt swings it about the canopy, away from / towards the viewer, to see its top or underneath;
 *  - the floor marker and shadow stay on the floor (hidden while tilted).
 * model-viewer itself only turns the model around the vertical axis.
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

  let tiltGoal = 0
  let tiltNow = 0
  let axis = { x: 1, z: 0 }
  /** Where ARRenderer put the target (x, z) at the start of this AR session. */
  let base: { x: number; z: number } | null = null
  let lastShift = 0
  let poseApplied = false

  // The floor marker lives inside the model, so it moves with it; keep it on the floor.
  let marker: { node: Object3DLike; baseY: number } | null = null
  const findMarker = () => {
    if (marker) return marker
    target.traverse?.((o) => {
      if (!marker && FLOOR_MARKER.test(o.name)) marker = { node: o, baseY: o.position.y }
    })
    return marker
  }

  // The shadow is drawn at the bottom of the model too; keep it on the floor (model-viewer also sets this
  // while dropping the model after a drag, so add our part to whatever it asks for).
  let shadowAsked = 0
  if (scene.setShadowOffset) {
    const originalOffset = scene.setShadowOffset.bind(scene)
    scene.setShadowOffset = (v: number) => {
      shadowAsked = v
      originalOffset(v + shift())
    }
  }

  const isTilted = () => Math.abs(tiltNow) > 1e-3 || Math.abs(tiltGoal) > 1e-3
  let shadowWasTilted = false

  const restoreStraight = () => {
    target.quaternion.set(0, 0, 0, 1)
    const m = findMarker()
    if (m) {
      m.node.position.y = m.baseY
      m.node.visible = true
    }
    poseApplied = false
  }

  // model-viewer calls updateTarget every AR frame, right after applying this frame's zoom and turn.
  const originalUpdate = scene.updateTarget.bind(scene)
  scene.updateTarget = (delta: number) => {
    if (!presenting()) {
      // Outside AR, leave the target alone (model-viewer restores the normal 3D view's target itself).
      if (poseApplied) restoreStraight()
      base = null
      lastShift = 0
      return originalUpdate(delta)
    }
    if (!base) base = { x: goalTarget.x, z: goalTarget.z }

    // Ease the tilt towards its goal.
    const ease = 1 - Math.exp(-Math.max(0, delta) / 90)
    tiltNow = Math.abs(tiltGoal - tiltNow) < 1e-3 ? tiltGoal : tiltNow + (tiltGoal - tiltNow) * ease

    const k = shift()
    if (k !== 0 || tiltNow !== 0 || poseApplied) {
      // Straight: ARRenderer's target is the bounding-box bottom (goal y = −min.y); lower it by k for the zoom.
      const p0 = { x: base.x, y: -box.min.y - k, z: base.z }
      // Tilt about the canopy C (top centre): position = p0 + C − R·C keeps C where it was.
      const c = { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 }
      const rc = rotateAboutHorizontalAxis(c, axis.x, axis.z, tiltNow)
      const pos = { x: p0.x + c.x - rc.x, y: p0.y + c.y - rc.y, z: p0.z + c.z - rc.z }
      goalTarget.x = pos.x
      goalTarget.y = pos.y
      goalTarget.z = pos.z
      target.position.x = pos.x
      target.position.y = pos.y
      target.position.z = pos.z
      const h = Math.sin(tiltNow / 2)
      target.quaternion.set(axis.x * h, 0, axis.z * h, Math.cos(tiltNow / 2))
      const m = findMarker()
      if (m) m.node.position.y = m.baseY + k
      poseApplied = k !== 0 || tiltNow !== 0
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
    tilt(step) {
      if (step === 0) {
        tiltGoal = 0
        return
      }
      // Pick the swing direction from where the viewer stands now (only when starting from straight).
      if (Math.abs(tiltNow) < 1e-3 && Math.abs(tiltGoal) < 1e-3) {
        const cam = scene.getCamera?.().matrixWorld.elements
        const pivot = scene.scenePivot
        if (cam && pivot) {
          const q = pivot.quaternion
          axis = tiltAxis(cam[12] - pivot.position.x, cam[14] - pivot.position.z, 2 * Math.atan2(q.y, q.w))
        }
      }
      tiltGoal = Math.max(-TILT_MAX, Math.min(TILT_MAX, tiltGoal + step * TILT_STEP))
    },
    isTilted,
    reset() {
      tiltGoal = 0
      tiltNow = 0
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

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = css
  if (text) node.textContent = text
  return node
}

const GLASS = "background:rgba(22,18,14,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;"
const FONT = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;"

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const ICON_UP = svg('<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>')
const ICON_DOWN = svg('<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>')
const ICON_MINUS = svg('<path d="M6 12h12"/>')
const ICON_PLUS = svg('<path d="M12 6v12M6 12h12"/>')

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

/**
 * Camera view, kept as clean as a shopping app's: nothing over the room except
 *  - a small name pill (top-left; model-viewer's own ✕ sits top-right),
 *  - a scan animation while looking for the floor (and again if tracking is lost),
 *  - one control bar: − · size (tap = real size, hanging straight) · + · see the top · see underneath.
 * Placing it gives a short vibration instead of a "Placed!" message.
 */
export function attachArOverlay(el: ModelViewerElement, info: () => { title: string; ceilingLabel: string }) {
  const root = h("div", `display:none;position:absolute;inset:0;pointer-events:none;${FONT}`)
  root.dataset.arOverlay = ""
  const style = document.createElement("style")
  style.textContent = SCAN_CSS
  root.appendChild(style)

  const title = h(
    "div",
    `${GLASS}position:absolute;top:calc(14px + env(safe-area-inset-top));left:14px;max-width:calc(100% - 96px);padding:7px 13px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
  )

  const scan = h("div", "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px")
  scan.dataset.arScan = ""
  scan.innerHTML = SCAN_ART
  const scanLabel = h("div", "font-size:13px;font-weight:600;color:#fff;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.7)", t.ar.arScan)
  scan.appendChild(scanLabel)

  const bar = h(
    "div",
    `${GLASS}position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border-radius:999px;pointer-events:auto`,
  )
  const btn = (html: string, aria: string, extra = "") => {
    const b = h(
      "button",
      `all:unset;box-sizing:border-box;cursor:pointer;height:46px;min-width:46px;display:flex;align-items:center;justify-content:center;border-radius:999px;color:#fff;${extra}`,
    )
    b.type = "button"
    b.innerHTML = html
    b.setAttribute("aria-label", aria)
    b.title = aria
    return b
  }
  const smaller = btn(ICON_MINUS, t.ar.arZoomOut)
  const real = btn("100%", t.ar.arResetSize, "padding:0 14px;font-size:14px;font-weight:700;background:rgba(255,255,255,.14);font-variant-numeric:tabular-nums;color:#f3dfb5")
  const bigger = btn(ICON_PLUS, t.ar.arZoomIn)
  const divider = h("span", "width:1px;height:26px;background:rgba(255,255,255,.25);margin:0 4px")
  const seeTop = btn(ICON_UP, t.ar.arTiltTopLabel)
  const seeBelow = btn(ICON_DOWN, t.ar.arTiltBelowLabel)
  bar.append(smaller, real, bigger, divider, seeTop, seeBelow)

  root.append(title, scan, bar)
  el.appendChild(root)
  // Our own buttons replace model-viewer's floating cube "AR" button.
  const noArButton = h("span", "display:none")
  noArButton.slot = "ar-button"
  el.appendChild(noArButton)

  const setGoal = (next: (current: number) => number) => {
    const r = arRenderer(el)
    if (!r) return
    r.goalScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next(r.goalScale || 1)))
  }
  smaller.addEventListener("click", () => setGoal((s) => s / 1.25))
  bigger.addEventListener("click", () => setGoal((s) => s * 1.25))
  // The size button is "put it back as it really is": real size, hanging straight.
  real.addEventListener("click", () => {
    setGoal(() => 1)
    poseControl(el)?.tilt(0)
  })
  seeTop.addEventListener("click", () => poseControl(el)?.tilt(1))
  seeBelow.addEventListener("click", () => poseControl(el)?.tilt(-1))

  // State: placed happens once per session; losing tracking only brings the scan animation back.
  let timer = 0
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
  const tick = () => {
    const s = currentScale(el)
    const isReal = Math.abs(s - 1) < 0.01
    real.textContent = isReal ? "100%" : `${Math.round(s * 100)}%`
    real.style.color = isReal ? "#f3dfb5" : "#fff"
  }

  el.addEventListener("ar-status", (e) => {
    const status = (e as CustomEvent<{ status: string }>).detail.status
    if (status === "session-started") {
      const { title: name, ceilingLabel } = info()
      title.textContent = ceilingLabel ? `${name} · ${ceilingLabel}` : name
      root.style.display = "block"
      placed = false
      softenShadow(el)
      poseControl(el)?.reset()
      setModelVisible(el, false)
      showScan(true)
      // Never leave the jhoomar hidden if the "placed" signal doesn't come.
      safety = window.setTimeout(markPlaced, 12000)
      // Window rAF can pause during an immersive session, so poll gently instead.
      timer = window.setInterval(tick, 150)
    } else if (status === "object-placed") {
      markPlaced()
    } else if (status === "not-presenting" || status === "failed") {
      root.style.display = "none"
      poseControl(el)?.reset()
      setModelVisible(el, true)
      window.clearInterval(timer)
      window.clearTimeout(safety)
    }
  })

  el.addEventListener("ar-tracking", (e) => {
    const tracking = (e as CustomEvent<{ status: string }>).detail.status
    showScan(tracking === "not-tracking" || !placed)
  })

  return { root }
}
