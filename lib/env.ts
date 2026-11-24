import "server-only"
import { z } from "zod"

/** Server-side environment, validated once on first use. */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is missing — see .env.example"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().optional(),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

export function serverEnv(): ServerEnv {
  if (!cached) cached = schema.parse(process.env)
  return cached
}
