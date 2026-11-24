export type PresignedUpload = {
  /** URL the browser PUTs the file to. */
  uploadUrl: string
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>
  /** Public URL the file will be served from once uploaded. */
  publicUrl: string
  key: string
}

export interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<{ publicUrl: string }>
  get(key: string): Promise<Uint8Array | null>
  publicUrl(key: string): string
  presignUpload(key: string, contentType: string, expiresInSeconds?: number): Promise<PresignedUpload>
}

/** Keys look like "models/abc123/web.glb". No leading slash, no "..". */
export function assertSafeKey(key: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/.test(key) || key.includes("..")) {
    throw new Error(`Unsafe storage key: ${key}`)
  }
  return key
}
