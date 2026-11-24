import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/lib/db"

/**
 * True when this deployment has what admin login needs (a database + an auth secret).
 * The public website works without either — e.g. a demo deploy on Vercel with no env vars.
 */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32)
}

function createAuth() {
  return betterAuth({
    appName: "JhoomAR Admin",
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // admins are created with `npm run admin:create`
      minPasswordLength: 10,
    },
    user: { modelName: "adminUser" },
    session: {
      modelName: "adminSession",
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh once a day
    },
    account: { modelName: "adminAccount" },
    verification: { modelName: "verification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    plugins: [nextCookies()],
  })
}

let instance: ReturnType<typeof createAuth> | undefined

/**
 * Admin-only authentication (email + password). Created on first use, never at import time,
 * so building/serving public pages doesn't need auth secrets or a database.
 */
export function getAuth() {
  if (!isAdminConfigured()) {
    throw new Error("Admin login is not set up: DATABASE_URL and BETTER_AUTH_SECRET are required.")
  }
  instance ??= createAuth()
  return instance
}
