import { afterEach, describe, expect, it, vi } from "vitest"

describe("/api/auth/[...all] on a deployment without a database (e.g. demo on Vercel)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("answers 503 'admin not configured' instead of crashing", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("BETTER_AUTH_SECRET", "")
    const { POST, GET } = await import("@/app/api/auth/[...all]/route")
    const res = await POST(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", body: "{}" }))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: "admin_not_configured" } })
    expect((await GET(new Request("http://localhost/api/auth/get-session"))).status).toBe(503)
  })

  it("isAdminConfigured needs both a database URL and a 32+ character secret", async () => {
    const { isAdminConfigured } = await import("@/lib/auth")
    vi.stubEnv("DATABASE_URL", "postgresql://x@localhost/db")
    vi.stubEnv("BETTER_AUTH_SECRET", "short")
    expect(isAdminConfigured()).toBe(false)
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
    expect(isAdminConfigured()).toBe(true)
  })
})
