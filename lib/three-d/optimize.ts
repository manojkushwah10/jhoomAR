import type { Document } from "@gltf-transform/core"
import { dedup, draco, prune, simplify, weld } from "@gltf-transform/functions"
import { MeshoptSimplifier } from "meshoptimizer"
import { triangleCount } from "./inspect"
import { BUDGET } from "./presets"

/**
 * Optimise a model in place: dedupe → prune → weld → simplify (only if over budget) → Draco.
 *
 * Textures (resize to ≤ 2048 px, WebP for the web GLB, JPEG/PNG for AR) are added in M3 with
 * `textureCompress` + sharp; the placeholder has no textures.
 * Draco is used for both web and AR files (Scene Viewer supports it; it does not reliably
 * support EXT_meshopt_compression).
 */
export async function optimizeDocument(doc: Document): Promise<{ simplified: boolean }> {
  await doc.transform(dedup(), prune(), weld())

  let simplified = false
  const tris = triangleCount(doc)
  if (tris > BUDGET.maxTriangles) {
    await MeshoptSimplifier.ready
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: (BUDGET.maxTriangles * 0.9) / tris, error: 0.001 }))
    simplified = true
  }

  await doc.transform(draco({ method: "edgebreaker", quantizePosition: 14, quantizeNormal: 10 }))
  return { simplified }
}
