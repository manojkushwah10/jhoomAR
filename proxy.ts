import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

/**
 * Optimistic check only: bounce visitors without a session cookie away from /admin.
 * The real check happens on the server in every admin page and route handler
 * (requireAdminPage / requireAdmin), because a cookie can exist but be expired.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLogin = pathname === "/admin/login"
  const hasCookie = Boolean(getSessionCookie(request))

  if (pathname.startsWith("/api/admin")) {
    if (!hasCookie) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Please sign in again." } },
        { status: 401 },
      )
    }
    return NextResponse.next()
  }

  if (!isLogin && !hasCookie) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }

  const response = NextResponse.next()
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}
