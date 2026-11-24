import "server-only"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { siteConfig } from "@/lib/site-config"
import { assertSafeKey, type StorageDriver } from "./types"

/** Development driver: files live in ./.storage and are served by /api/storage/[...key]. */
export const ROOT = path.join(process.cwd(), ".storage")

export const localDriver: StorageDriver = {
  async put(key, body) {
    const file = path.join(ROOT, assertSafeKey(key))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
    return { publicUrl: this.publicUrl(key) }
  },
  async get(key) {
    try {
      return new Uint8Array(await readFile(path.join(ROOT, assertSafeKey(key))))
    } catch {
      return null
    }
  },
  publicUrl(key) {
    return `${siteConfig.url}/api/storage/${assertSafeKey(key)}`
  },
  async presignUpload(key, contentType) {
    const url = this.publicUrl(key)
    return { uploadUrl: url, headers: { "Content-Type": contentType }, publicUrl: url, key }
  },
}
