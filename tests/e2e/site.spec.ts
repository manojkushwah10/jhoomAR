import { expect, test } from "@playwright/test"

test("home page links to the demo product", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("h1")).toHaveCount(1)
  await page.getByRole("link", { name: "See the demo jhoomar" }).click()
  await expect(page).toHaveURL(/\/products\/demo-jhoomar$/)
})

test.describe("crawler files", () => {
  test.skip(({ isMobile }) => isMobile, "run once")

  test("robots.txt blocks admin + api, sitemap lists the product", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text()
    expect(robots).toContain("Disallow: /admin")
    expect(robots).toContain("Disallow: /api/")
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/)
    const sitemap = await (await request.get("/sitemap.xml")).text()
    expect(sitemap).toContain("/products/demo-jhoomar")
  })
})
