"use client"

import { t } from "@/lib/i18n"
import type { ModelViewerElement } from "@/types/model-viewer"

/**
 * Camera-view layout for in-Chrome AR (WebXR). Everything here is a child of <model-viewer>, which makes it
 * part of model-viewer's AR "DOM overlay", drawn on top of the camera.
 *
 *  ┌──────────────────────────────┐
 *  │ (✕ model-viewer)   Title     │  ← product name + "10 ft ceiling" chip
 *  │                              │
 *  │   Point at the floor…        │  ← until the jhoomar is placed
 *  │                              │
 *  │        [ Real size ]         │  ← live size readout (Real size / 125 %)
 *  │   [ − ]  [100%]  [ + ]       │  ← smaller · back to real size · bigger
 *  │ Drag: move · Twist · Pinch   │
 *  └──────────────────────────────┘
 *
 * Zoom buttons drive model-viewer's own AR scale (the same value pinching changes), so buttons and
 * pinch stay in sync and "Back to real size" always returns to exactly 100 %.
 */

type ArRendererLike = { goalScale: number }
type SceneLike = { scenePivot?: { scale: { x: number } } }

const MIN_SCALE = 0.25
const MAX_SCALE = 4

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
const currentScale = (el: ModelViewerElement) => internal<SceneLike>(el, "scene")?.scenePivot?.scale.x ?? 1

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

  // Top: title + ceiling chip (model-viewer's own ✕ exit button sits top-left).
  const top = h("div", "position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;left:72px;display:flex;flex-direction:column;align-items:flex-end;gap:6px")
  const title = h("div", `${GLASS}padding:8px 14px;border-radius:14px;font:600 15px/1.25 Georgia,'Times New Roman',serif;max-width:100%;text-align:right`)
  const chip = h("div", `${GLASS}padding:5px 12px;border-radius:999px;font-size:12px;letter-spacing:.02em;color:#f3dfb5`)
  top.append(title, chip)

  // Middle: find-the-floor prompt (until placed).
  const prompt = h(
    "div",
    `${GLASS}position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:min(82%,340px);padding:14px 16px;border-radius:16px;font-size:14px;line-height:1.4;text-align:center`,
    t.ar.arFindFloor,
  )

  // Bottom: size readout, controls, gesture hint.
  const bottom = h("div", "position:absolute;left:0;right:0;bottom:calc(18px + env(safe-area-inset-bottom));display:none;flex-direction:column;align-items:center;gap:10px")
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
  const hint = h("div", "padding:0 16px;font-size:12px;color:rgba(255,255,255,.88);text-shadow:0 1px 3px rgba(0,0,0,.6);text-align:center", t.ar.arGestures)
  bottom.append(readout, row, hint)

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

  let timer = 0
  const showPlaced = (placed: boolean) => {
    prompt.style.display = placed ? "none" : "block"
    bottom.style.display = placed ? "flex" : "none"
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
      showPlaced(false)
      // Window rAF can pause during an immersive session, so poll gently instead.
      timer = window.setInterval(tick, 150)
    } else if (status === "object-placed") {
      showPlaced(true)
    } else if (status === "not-presenting" || status === "failed") {
      root.style.display = "none"
      window.clearInterval(timer)
    }
  })

  // Also hide the prompt once the camera is tracking and the model has been placed by a drag.
  el.addEventListener("ar-tracking", (e) => {
    if ((e as CustomEvent<{ status: string }>).detail.status === "not-tracking") showPlaced(false)
  })

  return { root }
}
