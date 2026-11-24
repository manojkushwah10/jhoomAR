import type { Document } from "@gltf-transform/core"
import { createHangingVariant } from "./hanging"
import { boundsSize, sceneBounds, triangleCount } from "./inspect"
import { getIO } from "./io"
import { optimizeDocument } from "./optimize"
import { BUDGET, CEILING_PRESETS, arFileName, type CeilingPresetId } from "./presets"
import { checkScale, type ExpectedSizeCm, type ScaleCheck } from "./scale"
import { validateGlb, type ValidationResult } from "./validate"

export type BuiltFile = {
  name: string
  bytes: Uint8Array
  sizeBytes: number
  triangles: number
  validation: ValidationResult
}

export type BuiltAssets = {
  web: BuiltFile
  ar: Record<CeilingPresetId, BuiltFile>
  sizeM: [number, number, number]
  scale: ScaleCheck
  warnings: string[]
}

async function finish(name: string, doc: Document): Promise<BuiltFile> {
  await optimizeDocument(doc)
  const io = await getIO()
  const bytes = await io.writeBinary(doc)
  return {
    name,
    bytes,
    sizeBytes: bytes.byteLength,
    triangles: triangleCount(doc),
    validation: await validateGlb(bytes),
  }
}

/**
 * AR viewers (Scene Viewer, Quick Look) don't use transmission/IOR/emissive-strength. Removing
 * them keeps the AR files to the smallest, most widely supported glTF feature set
 * (only KHR_draco_mesh_compression remains). Crystals fall back to their semi-transparent colour.
 */
const BROWSER_ONLY_EXTENSIONS = ["KHR_materials_transmission", "KHR_materials_ior", "KHR_materials_volume", "KHR_materials_emissive_strength"]

function stripBrowserOnlyExtensions(doc: Document): Document {
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (BROWSER_ONLY_EXTENSIONS.includes(ext.extensionName)) ext.dispose()
  }
  return doc
}

/**
 * From one source model (metres, uncompressed) build:
 *   - web.glb            for the 3D viewer
 *   - ar-<ceiling>.glb   hanging AR variants, one per ceiling preset
 */
export async function buildCeilingLightAssets(source: Document, expected: ExpectedSizeCm): Promise<BuiltAssets> {
  const scale = checkScale(source, expected)
  const sizeM = boundsSize(sceneBounds(source))

  const arDocs = CEILING_PRESETS.map((p) => [p.id, stripBrowserOnlyExtensions(createHangingVariant(source, p.metres))] as const)
  const web = await finish("web.glb", source)
  const ar = {} as Record<CeilingPresetId, BuiltFile>
  for (const [id, doc] of arDocs) ar[id] = await finish(arFileName(id), doc)

  const warnings = [...scale.warnings]
  for (const file of [web, ...Object.values(ar)]) {
    if (!file.validation.ok) warnings.push(`${file.name} has ${file.validation.errors.length} glTF errors.`)
    if (file.sizeBytes > BUDGET.maxBytes) warnings.push(`${file.name} is over the 8 MB limit.`)
    else if (file.sizeBytes > BUDGET.targetBytes) warnings.push(`${file.name} is over the 5 MB target.`)
    if (file.triangles > BUDGET.maxTriangles) warnings.push(`${file.name} has more than 150k triangles.`)
  }
  return { web, ar, sizeM, scale, warnings }
}
