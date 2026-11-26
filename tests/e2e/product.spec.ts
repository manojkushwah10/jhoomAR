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

test.describe("3D viewer controls", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebGL check in Chromium")

  test("zoom in/out, reset and full screen work", async ({ page }) => {
    await page.goto(PATH)
    await page.getByRole("button", { name: "View in 3D" }).click()
    const mv = page.locator("model-viewer:not([ar])").first()
    await expect.poll(() => mv.evaluate((el) => (el as unknown as { loaded: boolean }).loaded), { timeout: 30_000 }).toBe(true)

    // The poster underneath fades out once the model is visible (no ghost image while rotating).
    await expect(page.getByRole("img", { name: /front view/ }).first()).toHaveClass(/opacity-0/)

    type Cam = { getCameraOrbit(): { radius: number }; getFieldOfView(): number }
    // "How big the jhoomar looks" = radius × tan(fov/2); smaller = more zoomed in.
    const view = () =>
      mv.evaluate((el) => {
        const c = el as unknown as Cam
        return c.getCameraOrbit().radius * Math.tan((c.getFieldOfView() * Math.PI) / 360)
      })
    const start = await view()

    const toolbar = page.getByRole("toolbar", { name: "3D view controls" })
    await toolbar.getByRole("button", { name: "Zoom in" }).click()
    await toolbar.getByRole("button", { name: "Zoom in" }).click()
    await expect.poll(view).toBeLessThan(start * 0.9)
    const zoomed = await view()
    await toolbar.getByRole("button", { name: "Zoom out" }).click()
    await expect.poll(view).toBeGreaterThan(zoomed * 1.05)
    await toolbar.getByRole("button", { name: "Reset view" }).click()
    await expect.poll(async () => Math.abs((await view()) / start - 1)).toBeLessThan(0.05)

    // Look from above / below (on phones an up/down swipe scrolls the page, so these buttons do it).
    const phiDeg = () => mv.evaluate((el) => ((el as unknown as { getCameraOrbit(): { phi: number } }).getCameraOrbit().phi * 180) / Math.PI)
    const startPhi = 84 // START.orbit in ModelViewer.tsx
    await expect.poll(async () => Math.abs((await phiDeg()) - startPhi)).toBeLessThan(2)
    await toolbar.getByRole("button", { name: "See it from above" }).click()
    await expect.poll(phiDeg).toBeLessThan(startPhi - 25)
    await toolbar.getByRole("button", { name: "See it from above" }).click()
    await toolbar.getByRole("button", { name: "See it from above" }).click()
    await expect.poll(phiDeg).toBeCloseTo(10, 0) // straight over the top, at the limit
    for (let i = 0; i < 5; i++) await toolbar.getByRole("button", { name: "See it from below" }).click()
    await expect.poll(phiDeg).toBeCloseTo(170, 0) // underneath, at the limit
    await toolbar.getByRole("button", { name: "Reset view" }).click()
    await expect.poll(async () => Math.abs((await phiDeg()) - startPhi)).toBeLessThan(2)

    await toolbar.getByRole("button", { name: "Full screen" }).click()
    const frame = page.locator("[data-expanded]")
    await expect(frame).toBeVisible()
    const box = await frame.boundingBox()
    const vp = page.viewportSize()!
    expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1)
    expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1)
    await expect(mv).toHaveAttribute("touch-action", "none")
    await page.getByRole("button", { name: "Close full screen" }).click()
    await expect(frame).toHaveCount(0)
    await expect(mv).toHaveAttribute("touch-action", "pan-y")
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

    const arElement = page.locator('model-viewer[data-ar-role="handoff"]')
    await expect(arElement).toHaveAttribute("src", /ar-305\.glb\?title=Aarohi.*&link=http/)
    await expect(arElement).toHaveAttribute("ios-src", /ar-305\.usdz$/)
    await expect(arElement).toHaveAttribute("ar-scale", "auto")
    await expect(arElement).toHaveAttribute("ar-modes", "scene-viewer quick-look")
  })

  test("Open camera launches Scene Viewer with a valid intent", async ({ page }) => {
    // Record the intent instead of letting the browser try to open the Google app.
    await page.addInitScript(() => {
      const w = window as unknown as { __arLinks: Array<{ href: string; rel: string }> }
      w.__arLinks = []
      HTMLAnchorElement.prototype.click = function () {
        w.__arLinks.push({ href: this.href, rel: this.rel })
      }
    })
    await page.goto(PATH)
    await page.getByRole("button", { name: "View in your room" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByText("11 ft").click()
    await expect(dialog.getByRole("alert")).toHaveCount(0) // localhost is a secure context: no https warning
    await dialog.getByRole("button", { name: "Open camera" }).click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { __arLinks: unknown[] }).__arLinks.length)).toBe(1)
    const [{ href }] = await page.evaluate(() => (window as unknown as { __arLinks: Array<{ href: string }> }).__arLinks)
    expect(href.startsWith("intent://arvr.google.com/scene-viewer/1.2?")).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1, href.indexOf("#Intent")))
    expect(params.get("mode")).toBe("ar_preferred")
    expect(params.get("resizable")).toBeNull() // pinch-to-zoom allowed (snaps back to real size)
    expect(params.get("title")).toBe("Aarohi 8-Arm Crystal Jhoomar")
    const file = new URL(params.get("file")!)
    expect(file.pathname).toBe("/models/demo-jhoomar/ar-335.glb")
    expect(href).toContain("package=com.google.android.googlequicksearchbox")
    expect(href).toContain("S.browser_fallback_url=")

    // The model Scene Viewer will download is really there, with the right type.
    const res = await page.request.get(file.toString())
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toBe("model/gltf-binary")
  })

  /**
   * The three ways the Scene Viewer hand-off can show nothing on a real phone:
   *  - fallback: Chrome can't reach Google's app and jumps to #model-viewer-no-ar-fallback
   *  - bounce:   Google's app opens and closes at once (page hidden → visible)
   *  - nothing:  no app opens at all
   */
  const failures = {
    fallback: () => {
      location.hash = "#model-viewer-no-ar-fallback"
    },
    bounce: () => {
      const set = (hidden: boolean) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") })
        document.dispatchEvent(new Event("visibilitychange"))
      }
      setTimeout(() => set(true), 100)
      setTimeout(() => set(false), 400)
    },
    nothing: () => {},
  } as const

  for (const [kind, fail] of Object.entries(failures)) {
    for (const xr of [true, false]) {
      test(`Google viewer ${kind} → ${xr ? "points back to the Chrome camera" : "says what to install"}`, async ({ page }) => {
        await page.addInitScript(
          ({ xrSupported, failSrc }) => {
            const fail = new Function(`return (${failSrc})`)() as () => void
            HTMLAnchorElement.prototype.click = function () {
              if (this.href.startsWith("intent://")) fail()
            }
            Object.defineProperty(navigator, "xr", {
              configurable: true,
              value: { isSessionSupported: async () => xrSupported, addEventListener() {}, removeEventListener() {} },
            })
          },
          { xrSupported: xr, failSrc: fail.toString() },
        )
        await page.goto(`${PATH}?ardebug=1`)
        await page.getByRole("button", { name: "View in your room" }).click()
        const dialog = page.getByRole("dialog")
        // With in-Chrome AR available, Google's viewer is the secondary link; otherwise it's the main button.
        const google = xr
          ? dialog.getByRole("button", { name: "Or open in Google's AR viewer" })
          : dialog.getByRole("button", { name: "Open camera", exact: true })
        await google.click()
        if (xr) {
          await expect(dialog.getByText("Google's AR viewer didn't open on this phone")).toBeVisible({ timeout: 6000 })
          await expect(dialog.getByRole("button", { name: "Open camera", exact: true })).toBeVisible()
        } else {
          await expect(dialog.getByText("Google Play Services for AR")).toBeVisible({ timeout: 6000 })
        }
        await expect(page.getByTestId("ar-debug")).toContainText("tap → handoff")
      })
    }
  }

  test("phones with in-Chrome AR: Open camera starts it directly in one tap (no Google app)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __intents: number }
      w.__intents = 0
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith("intent://")) w.__intents++
      }
      Object.defineProperty(navigator, "xr", {
        configurable: true,
        value: { isSessionSupported: async () => true, addEventListener() {}, removeEventListener() {} },
      })
    })
    await page.goto(`${PATH}?ardebug=1`)
    await page.getByRole("button", { name: "View in your room" }).click()
    const dialog = page.getByRole("dialog")
    const xrEl = page.locator('model-viewer[data-ar-role="webxr"]')
    await expect(xrEl).toBeAttached({ timeout: 15_000 })
    // Record the AR start instead of opening a real camera session.
    await xrEl.evaluate((el) => {
      ;(el as unknown as { activateAR: () => Promise<void> }).activateAR = async () => {
        ;(window as unknown as { __webxr: boolean }).__webxr = true
      }
    })
    await dialog.getByRole("button", { name: "Open camera", exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __webxr?: boolean }).__webxr ?? false)).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { __intents: number }).__intents)).toBe(0)
    await expect(page.getByTestId("ar-debug")).toContainText("tap → webxr")
  })

  test("in-Chrome AR camera: clean view, no buttons — fingers spin, pinch and double-tap", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "xr", {
        configurable: true,
        value: { isSessionSupported: async () => true, addEventListener() {}, removeEventListener() {} },
      })
    })
    await page.goto(PATH)
    await page.getByRole("button", { name: "View in your room" }).click()
    await page.getByRole("dialog").getByText("10 ft").click()
    const xrEl = page.locator('model-viewer[data-ar-role="webxr"]')
    await expect(xrEl).toBeAttached({ timeout: 15_000 })

    // Pretend the WebXR session started, like model-viewer does on a phone.
    const status = (s: string) => xrEl.evaluate((el, s) => el.dispatchEvent(new CustomEvent("ar-status", { detail: { status: s } })), s)
    await status("session-started")
    const overlay = xrEl.locator("[data-ar-overlay]")
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText("Aarohi 8-Arm Crystal Jhoomar")
    await expect(overlay).toContainText("10 ft")
    const internalScene = () =>
      xrEl.evaluate((el) => {
        let proto: object | null = el
        while (proto) {
          for (const sym of Object.getOwnPropertySymbols(proto)) {
            if (sym.description === "scene") {
              const sc = (el as unknown as Record<symbol, { target: { visible: boolean }; shadowIntensity: number; setShadowIntensity(v: number): void }>)[sym]
              sc.setShadowIntensity(0.8) // what model-viewer sets in AR
              return { modelVisible: sc.target.visible, shadow: sc.shadowIntensity }
            }
          }
          proto = Object.getPrototypeOf(proto)
        }
        return null
      })
    const scan = overlay.locator("[data-ar-scan]")
    await expect(scan).toBeVisible()
    // Hidden until anchored to the floor (no "sticker following the phone"), soft shadow.
    expect(await internalScene()).toEqual({ modelVisible: false, shadow: 0.18 })
    // No buttons over the camera (model-viewer's own ✕ lives in its shadow DOM).
    await expect(overlay.getByRole("button")).toHaveCount(0)

    await status("object-placed")
    await expect(scan).toBeHidden()
    expect((await internalScene())!.modelVisible).toBe(true)
    // No text popups over the camera once it's placed: just the name pill.
    await expect(overlay).not.toContainText("Placed")
    await expect(overlay).not.toContainText("Drag")

    // Owner's recording: tracking lost after placement must NOT bring back the floor prompt.
    const tracking = (s: string) => xrEl.evaluate((el, s) => el.dispatchEvent(new CustomEvent("ar-tracking", { detail: { status: s } })), s)
    await tracking("not-tracking")
    await expect(scan).toBeVisible()
    await tracking("tracking")
    await expect(scan).toBeHidden()

    // Pinch drives model-viewer's own AR scale; double-tap puts it back to real size.
    const goal = () =>
      xrEl.evaluate((el) => {
        let proto: object | null = el
        while (proto) {
          for (const sym of Object.getOwnPropertySymbols(proto)) {
            if (sym.description === "renderer") return (el as unknown as Record<symbol, { arRenderer: { goalScale: number } }>)[sym].arRenderer.goalScale
          }
          proto = Object.getPrototypeOf(proto)
        }
        return null
      })
    type Touch = [type: string, id: number, x: number, y: number]
    const touches = (list: Touch[]) =>
      overlay.evaluate((root, list) => {
        for (const [type, id, x, y] of list) {
          root.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }))
        }
      }, list)
    // Two fingers 100 px apart spread to 150 px → 150 %.
    await touches([
      ["pointerdown", 1, 150, 300],
      ["pointerdown", 2, 250, 300],
      ["pointermove", 1, 125, 300],
      ["pointermove", 2, 275, 300],
      ["pointerup", 1, 125, 300],
      ["pointerup", 2, 275, 300],
    ])
    expect(await goal()).toBeCloseTo(1.5, 5)
    await expect(overlay.locator("[data-ar-zoom]")).toHaveText("150%")
    // One-finger drag spins it where it hangs (no zoom change).
    await touches([
      ["pointerdown", 3, 200, 300],
      ["pointermove", 3, 260, 360],
      ["pointerup", 3, 260, 360],
    ])
    expect(await goal()).toBeCloseTo(1.5, 5)
    // Double-tap → real size.
    await touches([
      ["pointerdown", 4, 200, 300],
      ["pointerup", 4, 200, 300],
      ["pointerdown", 5, 202, 301],
      ["pointerup", 5, 202, 301],
    ])
    expect(await goal()).toBe(1)

    await status("not-presenting")
    await expect(overlay).toBeHidden()
  })

  test("coming back from a failed Scene Viewer shows what to do", async ({ page }) => {
    await page.goto(`${PATH}#model-viewer-no-ar-fallback`)
    await expect(page.getByText("Google Play Services for AR")).toBeVisible()
  })

  test("arriving from the desktop QR code (?ar=1) opens the ceiling picker", async ({ page }) => {
    await page.goto(`${PATH}?ar=1`)
    await expect(page.getByRole("dialog", { name: "How high is your ceiling?" })).toBeVisible()
  })
})

test.describe("iPhone (Quick Look)", () => {
  test.skip(({ browserName }) => browserName !== "webkit", "WebKit only")

  test("Open camera opens the pre-built USDZ in AR Quick Look", async ({ page }) => {
    // Playwright's WebKit has no AR Quick Look, so pretend <a rel="ar"> is supported (as on a real iPhone).
    await page.addInitScript(() => {
      const supports = DOMTokenList.prototype.supports
      DOMTokenList.prototype.supports = function (token: string) {
        return token === "ar" ? true : supports.call(this, token)
      }
      const w = window as unknown as { __arLinks: Array<{ href: string; rel: string }> }
      w.__arLinks = []
      HTMLAnchorElement.prototype.click = function () {
        w.__arLinks.push({ href: this.href, rel: this.rel })
      }
    })
    await page.goto(PATH)
    await page.getByRole("button", { name: "View in your room" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByText("9 ft").click()
    await dialog.getByRole("button", { name: "Open camera" }).click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { __arLinks: unknown[] }).__arLinks.length)).toBe(1)
    const [link] = await page.evaluate(() => (window as unknown as { __arLinks: Array<{ href: string; rel: string }> }).__arLinks)
    expect(link.rel).toBe("ar")
    const url = new URL(link.href)
    expect(url.pathname).toBe("/models/demo-jhoomar/ar-275.usdz")
    expect(url.hash).toBe("") // scaling allowed in Quick Look
    const res = await page.request.get(url.toString())
    expect(res.headers()["content-type"]).toBe("model/vnd.usdz+zip")
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
