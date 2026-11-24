/**
 * Create (or reset the password of) an admin user.
 *
 *   npm run admin:create -- --email owner@example.com --name "Owner"
 *
 * The password is read from the ADMIN_PASSWORD env var, or asked for interactively.
 */
import { config } from "dotenv"
config({ path: ".env.local", quiet: true })

import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { hashPassword } from "better-auth/crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../lib/generated/prisma/client"

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  })
  const email = values.email?.trim().toLowerCase()
  if (!email || !email.includes("@")) throw new Error("Pass --email you@example.com")
  const name = values.name?.trim() || email.split("@")[0]

  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    password = await askHidden("Password (min 10 characters): ")
    const again = await askHidden("Type it again: ")
    if (password !== again) throw new Error("The two passwords don't match. Please run the command again.")
  }
  if (password.length < 10) throw new Error("Password must be at least 10 characters")

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const hash = await hashPassword(password)
    const existing = await prisma.adminUser.findUnique({ where: { email } })
    const userId = existing?.id ?? randomUUID()
    if (!existing) {
      await prisma.adminUser.create({ data: { id: userId, email, name, emailVerified: true } })
    }
    const account = await prisma.adminAccount.findFirst({ where: { userId, providerId: "credential" } })
    if (account) {
      await prisma.adminAccount.update({ where: { id: account.id }, data: { password: hash } })
    } else {
      await prisma.adminAccount.create({
        data: { id: randomUUID(), userId, accountId: userId, providerId: "credential", password: hash },
      })
    }
    console.log(existing ? `Password updated for ${email}` : `Admin created: ${email}`)
  } finally {
    await prisma.$disconnect()
  }
}

/** Prompt without echoing what is typed. */
async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const out = rl as unknown as { _writeToOutput: (s: string) => void }
  let muted = false
  out._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s)
  }
  const answer = rl.question(question)
  muted = true
  const value = await answer
  rl.close()
  process.stdout.write("\n")
  return value
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
