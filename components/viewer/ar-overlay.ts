"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera-view layout for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it
 * part of model-viewer's AR "DOM overlay", drawn on top of the camera.
 *
 *  ┌──────────────────────────────┐
 *  │ Title          (✕ model-v.)  │  ← product name + "10 ft ceiling" chip
 *  │                              │
 *  │   Point at the floor…        │  ← tip pill (until placed / when tracking is lost)
 *  │                              │
 *  │        [ Real size ]         │  ← live size readout (Real size / 125 %)
 *  │   [ − ]  [100%]  [ + ]       │  ← smaller · back to real size · bigger
 *  │ [▲ Top] [Straight] [▼ Below] │  ← tilt about the ceiling point to see the top / underneath
 *  │ Drag: move · Twist · Pinch   │
 *  └──────────────────────────────┘
 *
 * Zoom buttons drive model-viewer's own AR scale (the same value pinching changes), so buttons and
 * pinch stay in sync and "Back to real size" always returns to exactly 100 %.
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
      if (m) {
        m.node.position.y = m.baseY + k
        m.node.visible = tiltNow === 0
      }
      poseApplied = k !== 0 || tiltNow !== 0
    }
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

const GLASS = "background:rgba(22,18,14,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;"
const FONT = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;"

export function attachArOverlay(el: ModelViewerElement, info: () => { title: string; ceilingLabel: string }) {
  const root = h("div", `display:none;position:absolute;inset:0;pointer-events:none;${FONT}`)
  root.dataset.arOverlay = ""

  // Top-left: title + ceiling chip (model-viewer's own ✕ exit button sits top-right).
  const top = h("div", "position:absolute;top:calc(14px + env(safe-area-inset-top));left:14px;right:72px;display:flex;flex-direction:column;align-items:flex-start;gap:6px")
  const title = h("div", `${GLASS}padding:8px 14px;border-radius:14px;font:600 15px/1.25 Georgia,'Times New Roman',serif;max-width:100%`)
  const chip = h("div", `${GLASS}padding:5px 12px;border-radius:999px;font-size:12px;letter-spacing:.02em;color:#f3dfb5`)
  top.append(title, chip)

  // Middle: find-the-floor prompt (until placed).
  const prompt = h(
    "div",
    `${GLASS}position:absolute;left:50%;bottom:calc(214px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(88%,360px);padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.4;text-align:center`,
    t.ar.arFindFloor,
  )

  // Bottom: size readout, controls, gesture hint.
  const bottom = h("div", "position:absolute;left:0;right:0;bottom:calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:10px")
  const readout = h("div", `${GLASS}padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;color:#f3dfb5`, t.ar.arRealSize)
  const row = h("div", `${GLASS}display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;pointer-events:auto`)
  const btn = (label: string, aria: string, wide = false) => {
    const b = h(
      "button",
      `all:unset;box-sizing:border-box;cursor:pointer;height:48px;${wide ? "padding:0 18px;font-size:14px;font-weight:600" : "width:48px;font-size:26px;line-height:48px"};border-radius:999px;text-align:center;color:#fff;background:rgba(255,255,255,.12)`,
      label,
    )
    b.type = "button"
    b.setAttribute("aria-label", aria)
    return b
  }
  const smaller = btn("−", t.ar.arZoomOut)
  const real = btn("100%", t.ar.arResetSize, true)
  const bigger = btn("+", t.ar.arZoomIn)
  row.append(smaller, real, bigger)
  // Tilt row: swing it about the ceiling point to see the top or the underneath, then hang it straight again.
  const tiltRow = h("div", `${GLASS}display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;pointer-events:auto`)
  const seeTop = btn(t.ar.arTiltTop, t.ar.arTiltTopLabel, true)
  const straight = btn(t.ar.arTiltStraight, t.ar.arTiltStraightLabel, true)
  const seeBelow = btn(t.ar.arTiltBelow, t.ar.arTiltBelowLabel, true)
  for (const b of [seeTop, straight, seeBelow]) b.style.padding = "0 14px"
  tiltRow.append(seeTop, straight, seeBelow)
  const hint = h("div", "padding:0 16px;font-size:12px;color:rgba(255,255,255,.88);text-shadow:0 1px 3px rgba(0,0,0,.6);text-align:center", t.ar.arGestures)
  bottom.append(readout, row, tiltRow, hint)

  root.append(top, prompt, bottom)
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
  real.addEventListener("click", () => setGoal(() => 1))
  seeTop.addEventListener("click", () => poseControl(el)?.tilt(1))
  seeBelow.addEventListener("click", () => poseControl(el)?.tilt(-1))
  straight.addEventListener("click", () => poseControl(el)?.tilt(0))

  // State: placed happens once per session; losing tracking only shows a temporary tip.
  let timer = 0
  let safety = 0
  let tipTimer = 0
  let placed = false
  const showPrompt = (text: string | null) => {
    prompt.style.display = text ? "block" : "none"
    if (text) prompt.textContent = text
  }
  const markPlaced = () => {
    if (placed) return
    placed = true
    window.clearTimeout(safety)
    setModelVisible(el, true)
    showPrompt(t.ar.arPlaced)
    window.clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => showPrompt(null), 4000)
  }
  const tick = () => {
    const s = currentScale(el)
    const isReal = Math.abs(s - 1) < 0.01
    readout.textContent = isReal ? `✓ ${t.ar.arRealSize}` : `${Math.round(s * 100)} %`
    readout.style.color = isReal ? "#f3dfb5" : "#fff"
  }

  el.addEventListener("ar-status", (e) => {
    const status = (e as CustomEvent<{ status: string }>).detail.status
    if (status === "session-started") {
      const { title: name, ceilingLabel } = info()
      title.textContent = name
      chip.textContent = `${ceilingLabel} ${t.ar.arCeiling}`
      root.style.display = "block"
      placed = false
      softenShadow(el)
      poseControl(el)?.reset()
      setModelVisible(el, false)
      showPrompt(t.ar.arFindFloor)
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
      window.clearTimeout(tipTimer)
    }
  })

  el.addEventListener("ar-tracking", (e) => {
    const tracking = (e as CustomEvent<{ status: string }>).detail.status
    if (tracking === "not-tracking") showPrompt(placed ? t.ar.arLostTracking : t.ar.arFindFloor)
    else if (placed) showPrompt(null)
  })

  return { root }
}
