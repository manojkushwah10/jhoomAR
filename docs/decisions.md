# Decisions log

Newest first. Format: decision — why — alternatives.

## 2026-11-25 — Full controls (owner request)

**AR zoom allowed (amends "real size only").** `ar-scale="auto"` in every AR viewer: it opens at real size, pinch zooms, and Scene Viewer, Quick Look and WebXR all snap back to 100 % near real size. Zooming scales from the floor marker, so the canopy leaves the ceiling while zoomed — "100%" puts it back.

**In-Chrome AR camera layout** (`components/viewer/ar-overlay.ts`, part of model-viewer's WebXR DOM overlay): product title + ceiling chip, "point at the floor" prompt until placed, live size readout, − / 100% / + buttons and a gesture hint. The buttons set model-viewer's internal `arRenderer.goalScale` (the value pinch changes), reached through its `renderer`/`scene` Symbols. That is private API, pinned to model-viewer 4.4 and covered by an E2E test; re-check on upgrade. Scene Viewer and Quick Look keep their own built-in UI.

**3D viewer:** zoom buttons (`zoom()`), pan (two-finger / right-drag), reset, full screen (Fullscreen API with a CSS overlay fallback for iPhone; `touch-action: none` while full screen), deeper zoom limits (0.25 m radius, 8° FOV). The poster fades out once the model loads, so it doesn't ghost through while rotating.

## 2026-11-25 — M1 phone test fixes

**Android AR, second round (owner's phone still showed nothing).** The hand-off can fail three ways: Chrome falls back (#model-viewer-no-ar-fallback), Google's app opens and closes at once (page hidden → visible; the recording showed the Google app's location icon), or nothing opens. All three now count as a failed attempt. If `navigator.xr.isSessionSupported("immersive-ar")` is true, "Open camera in browser" (WebXR) becomes the main button; it's also offered from the start as "Or open the camera right here in Chrome". WebXR runs on its own pre-loaded `<model-viewer data-ar-role="webxr">`, separate from the Scene Viewer/Quick Look one. `?ardebug=1` shows a diagnostics panel (capabilities + event timeline) for phone testing.

**Android AR: Scene Viewer first, then WebXR inside Chrome.** On the owner's Android phone, Chrome couldn't hand the intent to Google's AR app (Scene Viewer): it jumped to the fallback URL and model-viewer went straight back, so "Open camera" looked dead. model-viewer then switches to the next mode but can't start WebXR without a new tap. We now (1) listen for the fallback live, (2) list `webxr` after `scene-viewer`, and (3) if `navigator.xr.isSessionSupported("immersive-ar")` is true, show "Open camera in browser". That opens AR in Chrome, which asks for camera permission. If WebXR isn't supported either, the visitor is told to install/update the Google app and "Google Play Services for AR". The AR element is preloaded (`loading="eager"`) once the sheet opens, so the WebXR session starts within the tap's user activation, and it's made fullscreen while a session is running.

**Plain-http warning.** Scene Viewer won't download over `http://` (e.g. the dev server at `http://192.168.x.x`), so the sheet warns when the page isn't a secure context.

**iOS third-party browsers** (Chrome/Edge/Firefox on iPhone) get the AR button too — same rule as model-viewer.


**3D engine loads on the visitor's first interaction** (scroll, touch, mouse move, key, or the "View in 3D" pill), not on page load or idle. Loading it on idle cost ~3 s of main-thread time and dropped Lighthouse performance to 46; on interaction it's 93 (SEO/accessibility/best-practices 100, CLS 0, TBT ~10 ms; lab LCP 3.2 s on simulated slow 4G — to be tuned in M4/M5 against the 2.5 s target). The poster image is the LCP element and is always server-rendered.

**Images served as WebP only** (no AVIF): AVIF encoding on first request was slow, and the sources are already WebP.

**Next.js 16.4 with Cache Components (default in create-next-app).** Pages are prerendered into a static shell; runtime reads (cookies, headers, searchParams) must be inside `<Suspense>`. Middleware is called `proxy.ts` in v16. — Best SEO/performance defaults. — Turning `cacheComponents` off (more familiar, less static).

**Better Auth instead of Auth.js credentials.** Admin-only email + password, public sign-up disabled, admins created with `npm run admin:create`. Login rate-limited (5/min) in Postgres. Tables are named `admin_user`, `admin_session`, `admin_account`. — Auth.js handed new development to the Better Auth team and is still v5 beta; its credentials provider has no built-in hashing or DB sessions. — Auth.js, Supabase Auth, iron-session.

**Prisma 7.10 pinned.** npm `latest` points at an 8.0 RC. Prisma 7 needs `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`); the client is generated into `lib/generated/prisma` (git-ignored, `postinstall` regenerates it). `prisma.config.ts` loads `.env.local` and prefers `DIRECT_URL` for migrations (Neon).

**Neon for cloud Postgres; local Homebrew Postgres for development and tests** (`jhoomar_dev`, `jhoomar_test`).

**Rate limiting in Postgres** (`rate_limit` table) — no Redis/Upstash account. Revisit if traffic grows.

**Storage behind one interface** (`lib/storage`): `local` driver (files in `.storage/`, served by `/api/storage/...` in development only) and `r2` driver (S3 API, presigned browser uploads).

**3D: real scale, metres, origin at the canopy for hanging lights.** The placeholder is built in code (`lib/three-d/placeholder.ts`): 80 cm Ø × 90 cm body + 40 cm chain = 130 cm total.

**Drop length = chain from the canopy to the top of the body.** Bottom of the light = ceiling − (drop + body height). With a 2.75 m ceiling the demo's bottom is at 1.45 m.

**Hanging AR via pre-built variants + floor marker.** Scene Viewer and Quick Look only place on the floor (bounding-box bottom). Each AR GLB has the light lifted so its top = ceiling, plus a faint disc + ring at y = 0. Variants for 2.75 / 3.05 / 3.35 / 3.65 m (9/10/11/12 ft), chosen by the customer before AR opens. — A single 2.75 m file looks wrong in common 10 ft rooms. Runtime re-generation is unnecessary (files are ~75 KB).

**Floor marker uses standard (emissive) materials, not `KHR_materials_unlit`.** three.js' USDZExporter — which model-viewer uses for iPhone — silently drops non-standard materials. An unlit marker would vanish on iPhone and the jhoomar would sit on the floor. There's a regression test for this.

**iPhone USDZ files are pre-built** (`ar-*.usdz`, via headless Chromium + three.js USDZExporter, the same code model-viewer uses on the fly). — Avoids Safari losing the tap "user gesture" during on-the-fly export, and opens faster. Cost: ~2 MB per file (USDZ isn't compressed). Admin can still override with a custom USDZ (M3).

**AR files: Draco + no WebP/Meshopt/instancing.** Scene Viewer doesn't reliably support `EXT_texture_webp`, `EXT_meshopt_compression` or `EXT_mesh_gpu_instancing`. Web GLB may use WebP once textures exist (M3).

**Draco decoder self-hosted** in `public/vendor/draco/` (copied from three.js) instead of Google's CDN — fewer third-party requests, works offline in tests.

**AR modes:** `scene-viewer quick-look` by default; `webxr` only with `NEXT_PUBLIC_AR_WEBXR_EXPERIMENTAL=true` (phase 2: ceiling detection).

**Crystals:** `KHR_materials_transmission` + IOR for the browser viewer; base colour alpha 0.45 (blend) as the fallback that Scene Viewer and Quick Look actually show. **Bulbs:** emissive + `KHR_materials_emissive_strength`.

**AR capability detection without loading model-viewer:** `<a rel="ar">` support → Quick Look; Android (non-Firefox, non in-app browser) → Scene Viewer. If Scene Viewer isn't installed, model-viewer returns with `#model-viewer-no-ar-fallback` and we show a friendly message.

**M1 product data is a typed fixture** (`lib/demo-product.ts`) so the demo deploys without a database. Replaced by Prisma in M2.

**Hosting:** Vercel Hobby is fine for the demo but its terms forbid commercial use — production needs Vercel Pro (~$20/month) or a Node host (Railway/Render). Decide in M5.

**Known tooling advisories (accepted for now):** `npm audit` reports issues in `effect` (via the Prisma CLI's config loader) and `minimatch` (via the shadcn CLI). Both are developer tools, not code that runs for site visitors. Re-check when Prisma 8 is stable.
