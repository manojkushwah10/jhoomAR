import { expect, test } from "@playwright/test"

const PATH = "/products/demo-jhoomar"

test.describe("demo product page", () => {
  test("is server-rendered with SEO essentials", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    const res = await page.goto(PATH)
    expect(res?.status()).toBe(200)

    await expect(page.locator("h1")).toHaveCount(1)
    await expect(page.locator("h1")).toHaveText("Aarohi 8-Arm Crystal Jhoomar")
    await expect(page).toHaveTitle(/Aarohi 8-Arm Crystal Jhoomar/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /real size/)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products\/demo-jhoomar$/)

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
    const product = ld.map((s) => JSON.parse(s)).find((d) => d["@type"] === "Product")
    expect(product.offers).toMatchObject({ priceCurrency: "INR", price: 48500 })

    // Poster (LCP image) is visible immediately and every image has alt text.
    const poster = page.getByRole("img", { name: /front view/ }).first()
    await expect(poster).toBeVisible()
    for (const alt of await page.locator("img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("alt")))) {
      expect(alt?.length).toBeGreaterThan(0)
    }
    await expect(page.getByRole("link", { name: "Enquire on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=.*JH-DEMO-08/)
    expect(errors).toEqual([])
  })

  test("has no horizontal scroll", async ({ page }) => {
    await page.goto(PATH)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only")

  test("shows the QR code instead of the AR button, and loads the 3D model", async ({ page }) => {
    await page.goto(PATH)
    await expect(page.getByRole("img", { name: /QR code linking to .*ar=1/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "View in your room" })).toHaveCount(0)

    // The 3D engine is not loaded until the visitor interacts (keeps LCP/TBT low)…
    await page.waitForTimeout(1500)
    await expect(page.locator("model-viewer")).toHaveCount(0)
    // …then appears on the first interaction.
    await page.getByRole("button", { name: "View in 3D" }).click()
    const mv = page.locator("model-viewer").first()
    await expect(mv).toBeAttached({ timeout: 15_000 })
    await expect.poll(() => mv.evaluate((el) => (el as unknown as { loaded: boolean }).loaded), { timeout: 30_000 }).toBe(true)
  })
})

test.describe("Android phone", () => {
  test.skip(({ browserName, isMobile }) => !isMobile || browserName !== "chromium", "Android only")

  test("View in your room → pick ceiling → hands the right hanging model to Scene Viewer", async ({ page }) => {
    await page.goto(PATH)
    await expect(page.getByRole("img", { name: /QR code/ })).toBeHidden()
    await page.getByRole("button", { name: "View in your room" }).click()

    const dialog = page.getByRole("dialog", { name: "How high is your ceiling?" })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("Point your camera at the floor")
    await dialog.getByText("10 ft").click()
    await expect(dialog.getByRole("button", { name: "Open camera" })).toBeEnabled({ timeout: 15_000 })

    const arElement = page.locator("model-viewer[ar]")
    await expect(arElement).toHaveAttribute("src", /ar-305\.glb\?title=Aarohi.*&link=http/)
    await expect(arElement).toHaveAttribute("ios-src", /ar-305\.usdz$/)
    await expect(arElement).toHaveAttribute("ar-scale", "fixed")
    await expect(arElement).toHaveAttribute("ar-modes", "scene-viewer quick-look")
  })

  test("arriving from the desktop QR code (?ar=1) opens the ceiling picker", async ({ page }) => {
    await page.goto(`${PATH}?ar=1`)
    await expect(page.getByRole("dialog", { name: "How high is your ceiling?" })).toBeVisible()
  })
})

test.describe("AR files", () => {
  test.skip(({ isMobile }) => isMobile, "run once")

  test("are served with the right content types for Scene Viewer and Quick Look", async ({ request }) => {
    const glb = await request.get("/models/demo-jhoomar/ar-275.glb")
    expect(glb.headers()["content-type"]).toBe("model/gltf-binary")
    expect(glb.headers()["access-control-allow-origin"]).toBe("*")
    const usdz = await request.get("/models/demo-jhoomar/ar-275.usdz")
    expect(usdz.headers()["content-type"]).toBe("model/vnd.usdz+zip")
    const draco = await request.get("/vendor/draco/draco_wasm_wrapper.js")
    expect(draco.ok()).toBe(true)
  })
})
