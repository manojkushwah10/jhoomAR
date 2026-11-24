/**
 * Generate the demo placeholder jhoomar into public/models/demo-jhoomar/:
 *   web.glb, ar-275.glb … ar-365.glb, manifest.json
 * Then (unless --no-render) render poster/gallery images + iPhone USDZ files with headless Chromium.
 *
 *   npm run model:placeholder
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildCeilingLightAssets } from "../lib/three-d/build-assets"
import { DEFAULT_PLACEHOLDER, buildPlaceholderJhoomar } from "../lib/three-d/placeholder"
import { renderAssets } from "./lib/render-assets"

const OUT = path.join(process.cwd(), "public/models/demo-jhoomar")

async function main() {
  const spec = DEFAULT_PLACEHOLDER
  const doc = buildPlaceholderJhoomar(spec)
  const assets = await buildCeilingLightAssets(doc, {
    widthCm: spec.diameterCm,
    depthCm: spec.diameterCm,
    heightCm: spec.dropLengthCm + spec.bodyHeightCm, // file includes canopy + chain
  })

  await mkdir(OUT, { recursive: true })
  const files = [assets.web, ...Object.values(assets.ar)]
  for (const f of files) await writeFile(path.join(OUT, f.name), f.bytes)

  const manifest = {
    generatedAt: new Date().toISOString(),
    spec,
    sizeCm: assets.sizeM.map((m) => Math.round(m * 1000) / 10),
    files: Object.fromEntries(
      files.map((f) => [f.name, { sizeBytes: f.sizeBytes, triangles: f.triangles, glTFErrors: f.validation.errors.length, glTFWarnings: f.validation.warnings.length }]),
    ),
    warnings: assets.warnings,
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")

  console.table(manifest.files)
  console.log("Size (cm, W × H × D):", manifest.sizeCm.join(" × "))
  if (assets.warnings.length) console.warn("Warnings:\n- " + assets.warnings.join("\n- "))

  if (!process.argv.includes("--no-render")) await renderAssets(OUT)
  if (assets.warnings.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
