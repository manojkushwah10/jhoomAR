import "server-only"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { serverEnv } from "@/lib/env"
import { assertSafeKey, type StorageDriver } from "./types"

function config() {
  const env = serverEnv()
  const missing = (
    ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"] as const
  ).filter((k) => !env[k])
  if (missing.length) throw new Error(`R2 storage is missing: ${missing.join(", ")}`)
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  })
  return { client, bucket: env.R2_BUCKET!, publicBase: env.R2_PUBLIC_BASE_URL!.replace(/\/$/, "") }
}

/** Cloudflare R2 through its S3-compatible API. */
export const r2Driver: StorageDriver = {
  async put(key, body, contentType) {
    const { client, bucket } = config()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: assertSafeKey(key),
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    )
    return { publicUrl: this.publicUrl(key) }
  },
  async get(key) {
    const { client, bucket } = config()
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: assertSafeKey(key) }))
      return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : null
    } catch {
      return null
    }
  },
  publicUrl(key) {
    return `${config().publicBase}/${assertSafeKey(key)}`
  },
  async presignUpload(key, contentType, expiresInSeconds = 600) {
    const { client, bucket } = config()
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: assertSafeKey(key), ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    )
    return { uploadUrl, headers: { "Content-Type": contentType }, publicUrl: this.publicUrl(key), key }
  },
}
