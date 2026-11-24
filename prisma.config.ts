import { config } from "dotenv"
import { defineConfig } from "prisma/config"

// Next.js reads .env.local; load the same file for the Prisma CLI.
config({ path: ".env.local", quiet: true })
config({ quiet: true })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on Neon.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
})
