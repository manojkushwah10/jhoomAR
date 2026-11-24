import { getBounds, type Document } from "@gltf-transform/core"

export type Bounds = { min: [number, number, number]; max: [number, number, number] }

/** World-space bounding box of the default scene (metres). */
export function sceneBounds(doc: Document): Bounds {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const { min, max } = getBounds(scene)
  return { min: [...min] as Bounds["min"], max: [...max] as Bounds["max"] }
}

export function boundsSize(b: Bounds): [number, number, number] {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
}

/** Total rendered triangles (counts every mesh instance). */
export function triangleCount(doc: Document): number {
  let total = 0
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      for (const prim of node.getMesh()?.listPrimitives() ?? []) {
        if (prim.getMode() !== 4) continue // TRIANGLES only
        const count = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0
        total += count / 3
      }
    })
  }
  return total
}
