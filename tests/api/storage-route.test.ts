import { rm } from "node:fs/promises"
import path from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const requireAdmin = vi.fn()
vi.mock("@/lib/admin-session", () => ({ requireAdmin: () => requireAdmin() }))

const { GET, PUT } = await import("@/app/api/storage/[...key]/route")

const ctx = (key: string[]) => ({ params: Promise.resolve({ key }) }) as never

describe("/api/storage/[...key] (dev-only local storage)", () => {
  beforeEach(() => requireAdmin.mockReset())
  afterAll(() => rm(path.join(process.cwd(), ".storage/test-uploads"), { recursive: true, force: true }))

  it("returns 404 JSON for a missing file", async () => {
    const res = await GET(new Request("http://localhost/api/storage/nope/x.glb"), ctx(["nope", "x.glb"]))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "File not found." } })
  })

  it("returns 404 for path traversal instead of reading outside .storage", async () => {
    const res = await GET(new Request("http://localhost/api/storage/x"), ctx(["..", ".env.local"]))
    expect(res.status).toBe(404)
  })

  it("rejects uploads without an admin session", async () => {
    requireAdmin.mockResolvedValue(Response.json({ error: { code: "unauthorized", message: "Please sign in again." } }, { status: 401 }))
    const res = await PUT(new Request("http://localhost/api/storage/a.glb", { method: "PUT", body: "x" }), ctx(["a.glb"]))
    expect(res.status).toBe(401)
  })

  it("stores and serves a file for a signed-in admin", async () => {
    requireAdmin.mockResolvedValue({ user: { id: "u1" } })
    const key = ["test-uploads", `${Date.now()}.glb`]
    const put = await PUT(new Request("http://localhost/x", { method: "PUT", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "model/gltf-binary" } }), ctx(key))
    expect(put.status).toBe(200)
    const get = await GET(new Request("http://localhost/x"), ctx(key))
    expect(get.headers.get("content-type")).toBe("model/gltf-binary")
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})
