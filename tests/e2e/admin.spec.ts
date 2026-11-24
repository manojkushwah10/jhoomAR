import { expect, test } from "@playwright/test"

test.describe("admin login", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only")

  test("signed-out visitors are sent to the login page, which is noindex", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  })

  test("admin API refuses requests without a session", async ({ request }) => {
    const res = await request.get("/api/admin/anything")
    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } })
  })

  test("wrong password shows a friendly error; right password opens the dashboard", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!)
    await page.getByLabel("Password").fill("definitely-wrong-password")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText(/don.t match/)).toBeVisible()

    await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByRole("heading", { name: "Welcome, Test Owner" })).toBeVisible()

    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
  })
})
