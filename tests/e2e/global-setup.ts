import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"

/** Migrate the test database and (re)create the e2e admin with a fresh random password. */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/jhoomar_test`
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: "" }
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "ignore" })
  const password = randomBytes(12).toString("base64url")
  process.env.E2E_ADMIN_EMAIL = "e2e-admin@jhoomar.test"
  process.env.E2E_ADMIN_PASSWORD = password
  execFileSync("npx", ["tsx", "scripts/create-admin.ts", "--email", process.env.E2E_ADMIN_EMAIL, "--name", "Test Owner"], {
    env: { ...env, ADMIN_PASSWORD: password },
    stdio: "ignore",
  })
}
