import { localDriver } from "@/lib/storage/local"
import { requireAdmin } from "@/lib/admin-session"

/**
 * Development-only file server for STORAGE_DRIVER=local.
 * In production (R2) files are served from the R2 public URL, so this returns 404.
 */
const enabled = () => process.env.STORAGE_DRIVER !== "r2" && process.env.NODE_ENV !== "production"

const TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  usdz: "model/vnd.usdz+zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

function notFound() {
  return Response.json({ error: { code: "not_found", message: "File not found." } }, { status: 404 })
}

export async function GET(_req: Request, ctx: RouteContext<"/api/storage/[...key]">) {
  if (!enabled()) return notFound()
  const key = (await ctx.params).key.join("/")
  let body: Uint8Array | null
  try {
    body = await localDriver.get(key)
  } catch {
    return notFound()
  }
  if (!body) return notFound()
  const ext = key.split(".").pop()?.toLowerCase() ?? ""
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  })
}

export async function PUT(req: Request, ctx: RouteContext<"/api/storage/[...key]">) {
  if (!enabled()) return notFound()
  const session = await requireAdmin()
  if (session instanceof Response) return session
  const key = (await ctx.params).key.join("/")
  const body = new Uint8Array(await req.arrayBuffer())
  try {
    const { publicUrl } = await localDriver.put(key, body, req.headers.get("content-type") ?? "")
    return Response.json({ publicUrl })
  } catch {
    return Response.json({ error: { code: "bad_key", message: "Invalid file name." } }, { status: 400 })
  }
}
