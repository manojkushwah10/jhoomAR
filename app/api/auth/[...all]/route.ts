import { toNextJsHandler } from "better-auth/next-js"
import { getAuth, isAdminConfigured } from "@/lib/auth"

function notConfigured() {
  return Response.json(
    { error: { code: "admin_not_configured", message: "Admin login isn't set up on this website yet." } },
    { status: 503 },
  )
}

export async function GET(request: Request) {
  if (!isAdminConfigured()) return notConfigured()
  return toNextJsHandler(getAuth()).GET(request)
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return notConfigured()
  return toNextJsHandler(getAuth()).POST(request)
}
