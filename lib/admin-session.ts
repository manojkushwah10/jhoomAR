import "server-only"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuth, isAdminConfigured } from "@/lib/auth"

export type AdminSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>

/** Returns the signed-in admin session, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isAdminConfigured()) return null
  return getAuth().api.getSession({ headers: await headers() })
}

/** For admin pages / server actions: redirects to the login page when signed out. */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) redirect("/admin/login")
  return session
}

/**
 * For admin route handlers. Returns the session, or a 401 JSON Response to return as-is.
 * Usage: `const s = await requireAdmin(); if (s instanceof Response) return s`
 */
export async function requireAdmin(): Promise<AdminSession | Response> {
  const session = await getAdminSession()
  if (!session) {
    return Response.json(
      { error: { code: "unauthorized", message: "Please sign in again." } },
      { status: 401 },
    )
  }
  return session
}
