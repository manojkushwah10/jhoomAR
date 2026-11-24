import { defineConfig, devices } from "@playwright/test"

const PORT = 3100
const TEST_DB = process.env.E2E_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/jhoomar_test`

/**
 * E2E runs against a production build (`next build && next start`) on port 3100,
 * using a separate local database (jhoomar_test) so dev data is never touched.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: TEST_DB, DIRECT_URL: "", BETTER_AUTH_URL: `http://localhost:${PORT}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}` },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "small-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } } },
  ],
})
