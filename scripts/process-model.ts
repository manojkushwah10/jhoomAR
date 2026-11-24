/**
 * Process a real ceiling-light model locally (for files too big/slow for serverless).
 *
 *   npm run model:process -- --in path/to/source.glb --out public/models/my-jhoomar \
 *     --width 80 --height 130 [--depth 80] [--fix-scale]
 *
 * --height is the total hanging length contained in the file (chain + body), in cm.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { buildCeilingLightAssets } from "../lib/three-d/build-assets"
import { getIO } from "../lib/three-d/io"
import { applyUniformScale, checkScale } from "../lib/three-d/scale"
import { renderAssets } from "./lib/render-assets"

async function main() {
  const { values } = parseArgs({
    options: {
      in: { type: "string" },
      out: { type: "string" },
      width: { type: "string" },
      height: { type: "string" },
      depth: { type: "string" },
      "fix-scale": { type: "boolean", default: false },
      "no-render": { type: "boolean", default: false },
    },
  })
  if (!values.in || !values.out || !values.width || !values.height) {
    throw new Error("Usage: --in <file.glb> --out <folder> --width <cm> --height <cm> [--depth <cm>] [--fix-scale]")
  }
  const expected = { widthCm: Number(values.width), heightCm: Number(values.height), depthCm: values.depth ? Number(values.depth) : undefined }
  const io = await getIO()
  const doc = await io.read(values.in)

  const check = checkScale(doc, expected)
  if (!check.ok && values["fix-scale"]) {
    applyUniformScale(doc, check.suggestedFactor)
    console.log(`Scaled by ${check.suggestedFactor.toFixed(4)} to match the product size.`)
  }
  const assets = await buildCeilingLightAssets(doc, expected)
  await mkdir(values.out, { recursive: true })
  for (const f of [assets.web, ...Object.values(assets.ar)]) await writeFile(path.join(values.out, f.name), f.bytes)
  console.table(Object.fromEntries([assets.web, ...Object.values(assets.ar)].map((f) => [f.name, { MB: (f.sizeBytes / 1048576).toFixed(2), triangles: f.triangles, errors: f.validation.errors.length }])))
  if (assets.warnings.length) console.warn("Warnings:\n- " + assets.warnings.join("\n- "))
  if (!values["no-render"]) await renderAssets(path.resolve(values.out))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
