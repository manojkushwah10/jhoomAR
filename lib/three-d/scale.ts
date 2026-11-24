import type { Document } from "@gltf-transform/core"
import { boundsSize, sceneBounds } from "./inspect"
import { SCALE_TOLERANCE } from "./presets"

/** Real-world size the admin typed in. Height = total hanging length of what the file contains. */
export type ExpectedSizeCm = { widthCm: number; heightCm: number; depthCm?: number }

export type ScaleCheck = {
  ok: boolean
  /** Model size in cm (x = width, y = height, z = depth). */
  modelCm: { width: number; height: number; depth: number }
  /** expected / actual, per axis that was given */
  ratios: { width: number; height: number; depth?: number }
  /** Uniform factor that best fixes the size (mean of the ratios). */
  suggestedFactor: number
  warnings: string[]
}

export function checkScale(doc: Document, expected: ExpectedSizeCm, tolerance = SCALE_TOLERANCE): ScaleCheck {
  const [x, y, z] = boundsSize(sceneBounds(doc)).map((m) => m * 100)
  const ratios: ScaleCheck["ratios"] = { width: expected.widthCm / x, height: expected.heightCm / y }
  if (expected.depthCm) ratios.depth = expected.depthCm / z
  const values = Object.values(ratios).filter((r): r is number => typeof r === "number")
  const warnings: string[] = []
  const describe = { width: "width", height: "height", depth: "depth" } as const
  for (const [axis, ratio] of Object.entries(ratios) as Array<[keyof typeof describe, number]>) {
    if (Math.abs(ratio - 1) > tolerance) {
      const actual = { width: x, height: y, depth: z }[axis]
      const wanted = { width: expected.widthCm, height: expected.heightCm, depth: expected.depthCm ?? 0 }[axis]
      warnings.push(`The 3D model's ${describe[axis]} is ${actual.toFixed(1)} cm, but the product says ${wanted} cm.`)
    }
  }
  return {
    ok: warnings.length === 0,
    modelCm: { width: x, height: y, depth: z },
    ratios,
    suggestedFactor: values.reduce((a, b) => a + b, 0) / values.length,
    warnings,
  }
}

/** Uniformly scale the whole scene (the "fix size automatically" button). */
export function applyUniformScale(doc: Document, factor: number): Document {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const wrapper = doc.createNode("Scale fix").setScale([factor, factor, factor])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrapper.addChild(child)
  }
  scene.addChild(wrapper)
  return doc
}
