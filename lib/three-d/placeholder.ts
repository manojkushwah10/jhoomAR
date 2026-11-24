import { Document, type Material } from "@gltf-transform/core"
import {
  KHRMaterialsEmissiveStrength,
  KHRMaterialsIOR,
  KHRMaterialsTransmission,
} from "@gltf-transform/extensions"
import {
  bezier,
  crystalDrop,
  cylinder,
  merge,
  ringOf,
  rotateX,
  rotateY,
  scale,
  sphere,
  torus,
  translate,
  tube,
  type Geometry,
} from "./geometry"

/**
 * Procedural placeholder jhoomar, so the full 3D + AR flow can be demoed without a real model.
 *
 * Origin = top of the ceiling canopy, everything hangs below (−Y). With the defaults:
 *   canopy + chain ("drop")  0.40 m
 *   body height              0.90 m   → bottom at y = −1.30 m
 *   body diameter            0.80 m   (rim of the candle cups)
 */
export type PlaceholderOptions = {
  diameterCm: number
  bodyHeightCm: number
  dropLengthCm: number
  arms: number
}

export const DEFAULT_PLACEHOLDER: PlaceholderOptions = {
  diameterCm: 80,
  bodyHeightCm: 90,
  dropLengthCm: 40,
  arms: 8,
}

export function buildPlaceholderJhoomar(options: Partial<PlaceholderOptions> = {}): Document {
  const o = { ...DEFAULT_PLACEHOLDER, ...options }
  const R = o.diameterCm / 200 // body radius (m)
  const drop = o.dropLengthCm / 100
  const H = o.bodyHeightCm / 100
  const top = -drop // y of the top of the body
  const bottom = -(drop + H)
  // Everything inside the body is laid out on a 0–1 scale (0 = body top, 1 = body bottom).
  const at = (f: number) => top - f * H
  const k = R / 0.4 // horizontal scale relative to the 80 cm reference design

  const brass: Geometry[] = []
  const crystal: Geometry[] = []
  const bulbs: Geometry[] = []
  const sleeves: Geometry[] = []

  // --- Ceiling canopy + chain -------------------------------------------------
  brass.push(translate(cylinder(0.07, 0.03, 32), 0, -0.015, 0))
  brass.push(translate(cylinder(0.02, 0.02, 16), 0, -0.04, 0))
  const chainTop = -0.05
  const linkPitch = 0.024
  const links = Math.max(1, Math.floor((top - 0.015 - chainTop) / -linkPitch))
  for (let i = 0; i < links; i++) {
    let link = scale(torus(0.009, 0.0025, 20, 6), 1, 1, 1.5) // flat oval ring
    link = rotateX(link, Math.PI / 2) // stand it up
    if (i % 2) link = rotateY(link, Math.PI / 2)
    brass.push(translate(link, 0, chainTop - linkPitch / 2 - i * linkPitch, 0))
  }

  // --- Central stem with decorative balls -------------------------------------
  brass.push(translate(sphere(0.03 * Math.max(k, 0.6), 16, 12), 0, top - 0.03 * Math.max(k, 0.6), 0))
  brass.push(translate(cylinder(0.018, at(0.87) - at(0.04), 16, false), 0, (at(0.04) + at(0.87)) / 2, 0))
  brass.push(translate(sphere(0.045 * k, 20, 14), 0, at(0.24), 0))
  brass.push(translate(sphere(0.07 * k, 24, 16, 1.4), 0, at(0.44), 0))
  brass.push(translate(sphere(0.05 * k, 20, 14), 0, at(0.72), 0))

  // --- Upper crown ring with small drops --------------------------------------
  const crownR = 0.16 * k
  brass.push(translate(torus(crownR, 0.006, 64, 8), 0, at(0.17), 0))
  for (let s = 0; s < 4; s++) {
    const spoke = tube(bezier([0.018, at(0.1), 0], [crownR * 0.6, at(0.1), 0], [crownR, at(0.17), 0], 10), 0.004, 6)
    brass.push(rotateY(spoke, (s / 4) * Math.PI * 2))
  }
  crystal.push(ringOf(translate(crystalDrop(0.009, 0.008, 0.026), 0, -0.01, 0), 16, crownR, at(0.17) - 0.012))

  // --- Main ring with a curtain of drops --------------------------------------
  const mainR = 0.31 * k
  const mainY = at(0.56)
  brass.push(translate(torus(mainR, 0.01, 96, 10), 0, mainY, 0))
  const bead = sphere(0.006, 8, 6)
  const hanging = merge([
    translate(bead, 0, -0.018, 0),
    translate(bead, 0, -0.032, 0),
    translate(crystalDrop(0.012, 0.012, 0.035), 0, -0.058, 0),
  ])
  crystal.push(ringOf(translate(hanging, 0, mainY, 0), 32, mainR, 0, Math.PI / 32))

  // --- Arms: S-curve from stem out to a candle cup at the rim -----------------
  const cupR = 0.04 * k
  const cupCentre = R - cupR
  const cupY = at(0.43)
  for (let a = 0; a < o.arms; a++) {
    const angle = (a / o.arms) * Math.PI * 2
    const arm = merge([
      tube(bezier([0.015, at(0.61), 0], [cupCentre * 0.85, at(0.72), 0], [cupCentre, cupY - 0.012, 0], 28), 0.009, 10),
      translate(cylinder(cupR, 0.02, 32), cupCentre, cupY, 0), // bobeche (cup)
    ])
    brass.push(rotateY(arm, angle))
    sleeves.push(rotateY(translate(cylinder(0.011, 0.075, 16), cupCentre, cupY + 0.0475, 0), angle))
    bulbs.push(rotateY(translate(sphere(0.016, 16, 12, 1.7), cupCentre, cupY + 0.085 + 0.016 * 1.7, 0), angle))
    // One drop under every cup, just inside the rim.
    crystal.push(rotateY(translate(hanging, cupCentre + cupR * 0.25, cupY - 0.005, 0), angle))
  }

  // --- Bottom finial -----------------------------------------------------------
  brass.push(translate(sphere(0.022 * Math.max(k, 0.6), 16, 12), 0, at(0.87) - 0.01, 0))
  crystal.push(translate(sphere(0.035 * Math.max(k, 0.6), 20, 14), 0, at(0.92), 0))
  const finialTop = 0.02
  const finialBottom = 0.05
  crystal.push(translate(crystalDrop(0.02, finialTop, finialBottom, 10), 0, bottom + finialBottom, 0))

  // --- Build the glTF document --------------------------------------------------
  const doc = new Document()
  doc.createBuffer()
  const transmission = doc.createExtension(KHRMaterialsTransmission)
  const ior = doc.createExtension(KHRMaterialsIOR)
  const emissiveStrength = doc.createExtension(KHRMaterialsEmissiveStrength)

  const brassMat = doc
    .createMaterial("Brass")
    .setBaseColorFactor([0.93, 0.7, 0.38, 1])
    .setMetallicFactor(1)
    .setRoughnessFactor(0.28)

  // Crystals: real transmission where supported; semi-transparent glass elsewhere (Scene Viewer, Quick Look).
  const crystalMat = doc
    .createMaterial("Crystal")
    .setBaseColorFactor([0.96, 0.98, 1, 0.45])
    .setAlphaMode("BLEND")
    .setMetallicFactor(0)
    .setRoughnessFactor(0.03)
    .setDoubleSided(true)
    .setExtension("KHR_materials_transmission", transmission.createTransmission().setTransmissionFactor(0.9))
    .setExtension("KHR_materials_ior", ior.createIOR().setIOR(1.55))

  const bulbMat = doc
    .createMaterial("Bulb (lit)")
    .setBaseColorFactor([1, 0.94, 0.82, 1])
    .setEmissiveFactor([1, 0.72, 0.38])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.4)
    .setExtension("KHR_materials_emissive_strength", emissiveStrength.createEmissiveStrength().setEmissiveStrength(4))

  const sleeveMat = doc
    .createMaterial("Candle sleeve")
    .setBaseColorFactor([0.95, 0.93, 0.88, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.55)

  const root = doc.createNode("Jhoomar")
  const scene = doc.createScene("Scene").addChild(root)
  doc.getRoot().setDefaultScene(scene)

  const parts: Array<[string, Geometry[], Material]> = [
    ["Brass frame", brass, brassMat],
    ["Crystals", crystal, crystalMat],
    ["Bulbs", bulbs, bulbMat],
    ["Candle sleeves", sleeves, sleeveMat],
  ]
  for (const [name, geometries, material] of parts) {
    root.addChild(doc.createNode(name).setMesh(meshFromGeometry(doc, name, merge(geometries), material)))
  }

  doc.getRoot().getAsset().generator = "JhoomAR placeholder generator"
  return doc
}

export function meshFromGeometry(doc: Document, name: string, g: Geometry, material: Material) {
  const buffer = doc.getRoot().listBuffers()[0]
  const position = doc.createAccessor(`${name} POSITION`).setType("VEC3").setArray(new Float32Array(g.positions)).setBuffer(buffer)
  const normal = doc.createAccessor(`${name} NORMAL`).setType("VEC3").setArray(new Float32Array(g.normals)).setBuffer(buffer)
  const vertexCount = g.positions.length / 3
  const indexArray = vertexCount > 65535 ? new Uint32Array(g.indices) : new Uint16Array(g.indices)
  const indices = doc.createAccessor(`${name} indices`).setType("SCALAR").setArray(indexArray).setBuffer(buffer)
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("NORMAL", normal)
    .setIndices(indices)
    .setMaterial(material)
  return doc.createMesh(name).addPrimitive(prim)
}
