import type { Document } from "@gltf-transform/core"
import { cloneDocument } from "@gltf-transform/functions"
import { annulus } from "./geometry"
import { sceneBounds } from "./inspect"
import { meshFromGeometry } from "./placeholder"

/**
 * Build the "hanging" AR variant of a ceiling light.
 *
 * Scene Viewer (Android) and AR Quick Look (iPhone) can only put a model on the floor (or a wall):
 * they sit the bottom of the model's bounding box on the detected floor. So we:
 *   1. lift the fitting until its top (the canopy) is at `ceilingM`,
 *   2. add a faint "light pool" disc at y = 0, so the bounding-box bottom IS the floor.
 * The customer points the camera at the floor under where the light will hang, and it appears
 * at the right height. Origin stays at floor level; x/z are centred.
 */
export function createHangingVariant(source: Document, ceilingM: number, options: { markerRadiusM?: number } = {}): Document {
  const doc = cloneDocument(source)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  const b = sceneBounds(doc)
  const height = b.max[1] - b.min[1]
  if (height >= ceilingM) {
    throw new Error(`This light is ${height.toFixed(2)} m tall — taller than a ${ceilingM} m ceiling.`)
  }

  const lift = doc
    .createNode("Hanging (lifted to ceiling)")
    .setTranslation([-(b.min[0] + b.max[0]) / 2, ceilingM - b.max[1], -(b.min[2] + b.max[2]) / 2])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    lift.addChild(child)
  }
  scene.addChild(lift)

  // Floor marker: soft filled disc + a clearer ring at the fitting's footprint.
  const radius = options.markerRadiusM ?? Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2
  if (!root.listBuffers().length) doc.createBuffer()
  // Standard (not KHR_materials_unlit) materials on purpose: three.js' USDZExporter — used by
  // model-viewer for iPhone Quick Look — silently DROPS non-standard materials, which would remove
  // the marker and let the fitting fall to the floor. Black base + emissive colour ≈ unlit.
  const markerMaterial = (name: string, alpha: number) =>
    doc
      .createMaterial(name)
      .setBaseColorFactor([0, 0, 0, alpha])
      .setEmissiveFactor([1, 0.82, 0.5])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setAlphaMode("BLEND")
      .setDoubleSided(true)
  const fill = markerMaterial("Floor marker fill", 0.14)
  const ring = markerMaterial("Floor marker ring", 0.55)
  const marker = doc.createNode("Floor marker (place me on the floor)")
  marker.addChild(doc.createNode("Fill").setMesh(meshFromGeometry(doc, "Marker fill", annulus(0, radius * 0.93, 64), fill)))
  marker.addChild(doc.createNode("Ring").setMesh(meshFromGeometry(doc, "Marker ring", annulus(radius * 0.93, radius, 64), ring)))
  scene.addChild(marker)

  return doc
}
