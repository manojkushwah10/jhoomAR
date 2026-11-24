/**
 * Render poster + gallery images and pre-build iPhone (Quick Look) USDZ files for a model folder,
 * using headless Chromium + <model-viewer> + three.js — the same renderer the website uses.
 *
 * Needs: npx playwright install chromium
 */
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "@playwright/test"

const ROOT = process.cwd()
const ORIGIN = "https://assets.local"
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".html": "text/html",
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"${ORIGIN}/three/build/three.module.js","three/addons/":"${ORIGIN}/three/examples/jsm/"}}</script>
<script type="module" src="${ORIGIN}/model-viewer.min.js"></script>
<style>html,body{margin:0;background:#f6f1e7}model-viewer{width:1200px;height:1500px;background:transparent}</style>
</head><body><model-viewer id="mv" environment-image="neutral" exposure="1.05" shadow-intensity="0"
interaction-prompt="none" camera-orbit="0deg 82deg auto" field-of-view="28deg"></model-viewer></body></html>`

/** Camera views: [file name, camera-orbit, field-of-view] */
const VIEWS: Array<[string, string, string]> = [
  ["poster.webp", "15deg 84deg auto", "28deg"],
  ["gallery-below.webp", "40deg 108deg auto", "30deg"],
  ["gallery-detail.webp", "-20deg 80deg 0.9m", "22deg"],
]

function resolve(urlPath: string, modelDir: string): string | null {
  if (urlPath === "/index.html") return null
  if (urlPath === "/model-viewer.min.js") return path.join(ROOT, "node_modules/@google/model-viewer/dist/model-viewer.min.js")
  if (urlPath.startsWith("/three/")) return path.join(ROOT, "node_modules", urlPath)
  if (urlPath.startsWith("/draco/")) return path.join(ROOT, "public/vendor", urlPath)
  if (urlPath.startsWith("/models/")) return path.join(modelDir, urlPath.slice("/models/".length))
  return null
}

export async function renderAssets(modelDir: string) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 })
    page.on("pageerror", (e) => console.error("[page]", e.message))
    await page.route(`${ORIGIN}/**`, async (route) => {
      const urlPath = decodeURIComponent(new URL(route.request().url()).pathname)
      if (urlPath === "/index.html") return route.fulfill({ body: PAGE, contentType: "text/html" })
      const file = resolve(urlPath, modelDir)
      if (!file || !file.startsWith(ROOT)) return route.fulfill({ status: 404, body: "not found" })
      try {
        const body = await readFile(file)
        return route.fulfill({ body, contentType: TYPES[path.extname(file)] ?? "application/octet-stream" })
      } catch {
        return route.fulfill({ status: 404, body: "not found" })
      }
    })
    await page.goto(`${ORIGIN}/index.html`)
    await page.waitForFunction(() => customElements.get("model-viewer") !== undefined)

    // Load the web model with a self-hosted Draco decoder.
    await page.evaluate(async (origin) => {
      const MV = customElements.get("model-viewer") as unknown as { dracoDecoderLocation: string }
      MV.dracoDecoderLocation = `${origin}/draco/`
      const mv = document.getElementById("mv") as HTMLElement & { loaded: boolean }
      await new Promise<void>((done, fail) => {
        mv.addEventListener("load", () => done(), { once: true })
        mv.addEventListener("error", (e) => fail(new Error(JSON.stringify((e as unknown as CustomEvent).detail))), { once: true })
        mv.setAttribute("src", `${origin}/models/web.glb`)
      })
    }, ORIGIN)

    for (const [name, orbit, fov] of VIEWS) {
      const b64 = await page.evaluate(
        async ({ orbit, fov }) => {
          type MV = HTMLElement & {
            jumpCameraToGoal(): void
            toBlob(o: { mimeType: string; idealAspect: boolean }): Promise<Blob>
          }
          const mv = document.getElementById("mv") as MV
          mv.setAttribute("camera-orbit", orbit)
          mv.setAttribute("field-of-view", fov)
          mv.jumpCameraToGoal()
          for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
          const shot = await createImageBitmap(await mv.toBlob({ mimeType: "image/png", idealAspect: false }))
          // Composite on the brand ivory with a soft warm glow.
          const c = document.createElement("canvas")
          c.width = shot.width
          c.height = shot.height
          const ctx = c.getContext("2d")!
          const g = ctx.createRadialGradient(c.width / 2, c.height * 0.45, 50, c.width / 2, c.height * 0.45, c.height * 0.75)
          g.addColorStop(0, "#fffaf0")
          g.addColorStop(1, "#efe6d4")
          ctx.fillStyle = g
          ctx.fillRect(0, 0, c.width, c.height)
          ctx.drawImage(shot, 0, 0)
          const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/webp", 0.86))
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let s = ""
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          return btoa(s)
        },
        { orbit, fov },
      )
      await writeFile(path.join(modelDir, name), Buffer.from(b64, "base64"))
      console.log(`rendered ${name}`)
    }

    // Pre-build USDZ for each hanging AR variant (iPhone opens these instantly, no on-tap export).
    const arFiles = (await readdir(modelDir)).filter((f) => /^ar-\d+\.glb$/.test(f))
    for (const file of arFiles) {
      const b64 = await page.evaluate(
        async ({ origin, file }) => {
          const { GLTFLoader } = await import(/* @vite-ignore */ "three/addons/loaders/GLTFLoader.js" as string)
          const { DRACOLoader } = await import(/* @vite-ignore */ "three/addons/loaders/DRACOLoader.js" as string)
          const { USDZExporter } = await import(/* @vite-ignore */ "three/addons/exporters/USDZExporter.js" as string)
          const draco = new DRACOLoader().setDecoderPath(`${origin}/draco/`)
          const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(`${origin}/models/${file}`)
          const buffer: ArrayBuffer = await new USDZExporter().parseAsync(gltf.scene, {
            quickLookCompatible: true,
            ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "horizontal" } },
          })
          const bytes = new Uint8Array(buffer)
          let s = ""
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          return btoa(s)
        },
        { origin: ORIGIN, file },
      )
      const out = file.replace(/\.glb$/, ".usdz")
      await writeFile(path.join(modelDir, out), Buffer.from(b64, "base64"))
      console.log(`exported ${out}`)
    }
  } finally {
    await browser.close()
  }
}
