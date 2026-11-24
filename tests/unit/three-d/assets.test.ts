import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildCeilingLightAssets } from "@/lib/three-d/build-assets"
import { sceneBounds } from "@/lib/three-d/inspect"
import { getIO } from "@/lib/three-d/io"
import { buildPlaceholderJhoomar } from "@/lib/three-d/placeholder"
import { BUDGET, CEILING_PRESETS, arFileName } from "@/lib/three-d/presets"
import { validateGlb } from "@/lib/three-d/validate"

const DEMO_DIR = path.join(process.cwd(), "public/models/demo-jhoomar")

describe("asset pipeline (placeholder → web + hanging AR GLBs)", () => {
  it("produces valid, compressed files within budget that round-trip at real scale", async () => {
    const assets = await buildCeilingLightAssets(buildPlaceholderJhoomar(), { widthCm: 80, heightCm: 130, depthCm: 80 })
    expect(assets.warnings).toEqual([])
    const io = await getIO()
    for (const file of [assets.web, ...Object.values(assets.ar)]) {
      expect(file.validation.errors, file.name).toEqual([])
      expect(file.sizeBytes).toBeLessThan(BUDGET.targetBytes)
      expect(file.triangles).toBeLessThan(BUDGET.maxTriangles)
    }
    // Draco-compressed AR file still has the canopy at 3.05 m (quantisation tolerance ~1 mm).
    const doc = await io.readBinary(assets.ar["305"].bytes)
    expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain("KHR_draco_mesh_compression")
    // AR files use only Draco — nothing Scene Viewer / Quick Look might not understand.
    expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toEqual(["KHR_draco_mesh_compression"])
    const b = sceneBounds(doc)
    expect(b.max[1]).toBeCloseTo(3.05, 2)
    expect(b.min[1]).toBeCloseTo(0, 2)
  })
})

describe("committed demo files in public/models/demo-jhoomar", () => {
  it("every GLB passes the Khronos glTF validator and the size budget", async () => {
    const glbs = (await readdir(DEMO_DIR)).filter((f) => f.endsWith(".glb"))
    expect(glbs).toEqual(expect.arrayContaining(["web.glb", ...CEILING_PRESETS.map((p) => arFileName(p.id))]))
    for (const f of glbs) {
      const bytes = new Uint8Array(await readFile(path.join(DEMO_DIR, f)))
      expect(bytes.byteLength).toBeLessThan(BUDGET.targetBytes)
      const result = await validateGlb(bytes)
      expect(result.errors, f).toEqual([])
    }
  })

  it("every ceiling preset has an iPhone USDZ that still contains the floor marker", async () => {
    for (const p of CEILING_PRESETS) {
      const bytes = await readFile(path.join(DEMO_DIR, arFileName(p.id, "usdz")))
      expect(bytes.byteLength).toBeLessThan(BUDGET.targetBytes)
      // USDZ = uncompressed zip of .usda text: the marker's Xform name must be in there.
      const text = bytes.toString("latin1")
      expect(text).toContain('def Xform "Floor_marker')
      expect(text).toContain("metersPerUnit = 1")
    }
  })
})
