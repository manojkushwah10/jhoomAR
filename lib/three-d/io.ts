import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import draco3d from "draco3dgltf"

let ioPromise: Promise<NodeIO> | undefined

/** A NodeIO that understands every Khronos extension, with Draco encoder + decoder. */
export function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    const [encoder, decoder] = await Promise.all([
      draco3d.createEncoderModule(),
      draco3d.createDecoderModule(),
    ])
    return new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "draco3d.encoder": encoder, "draco3d.decoder": decoder })
  })()
  return ioPromise
}
