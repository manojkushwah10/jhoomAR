@AGENTS.md

# JhoomAR — Project instructions

> "See it hanging in your room before you buy."
> One single Next.js project: public website + API (route handlers) + admin panel at `/admin`.
> Agreed changes to the original brief are listed in **0. Amendments** and in `docs/decisions.md`. Where they conflict with the text below, the amendments win.

## 0. Amendments (agreed 2026-11-25)

- **Auth:** Better Auth (email + password, Prisma adapter) instead of Auth.js credentials.
- **Prisma:** pinned to 7.10.x (npm `latest` is an 8.0 RC). Prisma 7 uses `prisma.config.ts` + the `pg` driver adapter.
- **Database:** Neon (Postgres) in the cloud. Local development uses the local Homebrew Postgres 17.
- **Rate limiting:** stored in Postgres (no Redis/Upstash account).
- **AR file format:** the web GLB may use WebP + Draco. The AR GLB uses Draco + JPEG/PNG only, because Scene Viewer doesn't reliably support WebP/Meshopt.
- **AR modes:** the default is `scene-viewer quick-look`. `webxr` is added only when `NEXT_PUBLIC_AR_WEBXR_EXPERIMENTAL=true`.
- **Next.js 16:** middleware is now `proxy.ts`. `cacheComponents` is on, so runtime reads (cookies, headers, searchParams) must sit behind `<Suspense>` or use `use cache: private`. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Drop length:** `dropLengthCm` = chain/rod length from the ceiling canopy to the top of the body. The bottom of the fitting hangs at `ceiling − (dropLength + bodyHeight)`.
- **Ceiling-height picker:** the AR files are pre-generated for 9 / 10 / 11 / 12 ft ceilings (2.75 / 3.05 / 3.35 / 3.65 m). Before AR opens, the customer picks one.
- **Floor marker:** every hanging AR GLB has a faint "light pool" disc at y = 0, so that every AR viewer (which sits the bounding-box bottom on the floor) keeps the canopy at ceiling height.
- **Package manager:** npm.
- **Hosting:** Vercel Hobby is OK for demos only (no commercial use). Production needs Vercel Pro or a Node host (Railway/Render) — decide in M5.

## 1. Who you are and how you work

You are the lead engineer for JhoomAR. You plan, build, test and document the whole project, working with specialised sub-agents (`.claude/agents/`).

1. **Plan before code.** At the start of every milestone, write a short plan (files, decisions, risks) and wait for "go" before large changes.
2. **Work in milestones** (section 10). At the end of each milestone: run all checks and tests, summarise what changed, list what must be tested on a real phone, then stop.
3. **Never fake results.** If something can't be tested here (camera, AR, real phones), say so and give a step-by-step manual checklist.
4. **Ask before:** installing global tools, adding paid services, changing the stack, or deleting files.
5. **Secrets** only in `.env.local` (never committed). Keep `.env.example` up to date.
6. Keep it simple: TypeScript strict, readable code, well-known libraries, no over-engineering.
7. User-facing copy in simple English, i18n-ready so Hindi can be added (strings live in `lib/i18n/`).
8. Keep `README.md` and `docs/` updated when setup or architecture changes.

## 2. Scope — exactly 3 parts, all inside ONE Next.js project

1. **Website** (public storefront) — SEO-first.
2. **API** — Next.js Route Handlers (`app/api/**/route.ts`, Node.js runtime) + Server Actions where simpler.
3. **Admin panel** — at `/admin`, protected by login.

**Out of scope:** mobile app, separate backend server, monorepo, microservices, separate worker service, online payments (phase 2 only).

## 3. The product

**Customer website**
1. Home: hero, featured jhoomars, categories, why-us, testimonials, contact/WhatsApp.
2. Catalogue: categories (jhoomar, pendant, wall light, ceiling light), filters (price, size, material, finish), sorting, pagination.
3. Product page: photos, price, dimensions (diameter × height × drop length), material, bulb type/count, variants, interactive **3D viewer** (rotate, zoom — laptop and phone).
4. **"View in your room"** (phones): camera, product at **real size** — wall lights on a detected wall; jhoomars/pendants **hanging at ceiling height** (section 6).
5. **Enquire on WhatsApp** (pre-filled: product name, code, link) + enquiry form saved to the DB.
6. About, Contact, FAQ, policy pages.
7. Works in the normal mobile browser (Chrome Android, Safari iPhone). Desktop: 3D viewer + QR "Scan to view in your room on your phone".

**Admin panel (`/admin`) — for a non-technical business owner**
1. Login (email + password).
2. Products: add/edit/delete, photos, price, dimensions in cm, materials, bulb count, variants, SEO fields (title, description, slug), publish/unpublish.
3. Categories: add/edit/reorder.
4. 3D models: upload GLB/GLTF → automatic processing → preview in 3D and AR → attach to product.
5. Enquiries inbox: list, status (new / contacted / converted), notes, CSV export.
6. Dashboard: product views, 3D views, AR opens, WhatsApp clicks, enquiries — per product and over time.
7. Site settings: WhatsApp number, contact details, logo, homepage banners.

Admin UI: big buttons, clear labels, helpful empty states, no technical words.

## 4. Tech stack

Next.js 16 (App Router) + TypeScript strict + Tailwind 4 + shadcn/ui (admin) · PostgreSQL (Neon) + Prisma 7 · Better Auth · Cloudflare R2 (S3 API, presigned browser uploads) with a local-disk driver for development · `<model-viewer>` (client-only, lazy) · `@gltf-transform/*` for 3D processing inside Next.js (Node runtime) · zod · react-hook-form · `next/image` · Vitest, Playwright, gltf-validator · one deployment (see Amendments → Hosting).

```
app/(site)/  app/admin/  app/api/  app/sitemap.ts  app/robots.ts
components/{site,admin,ui,viewer}/
lib/  lib/three-d/  prisma/  scripts/  tests/{unit,api,e2e}/  docs/  .claude/agents/
```

## 5. API (Route Handlers under `app/api/`)

Public: `GET /api/products` (filters + pagination) · `GET /api/products/[slug]` (glbUrl, usdzUrl?, posterUrl, placement, hang height, dimensions) · `GET /api/categories` · `POST /api/enquiries` (saves, returns WhatsApp link) · `POST /api/events` (`product_view`, `view_3d`, `ar_open`, `whatsapp_click`, `qr_shown`).

Admin (session checked in every handler): CRUD `/api/admin/products`, `/api/admin/categories` · `POST /api/admin/uploads/presign` · `POST /api/admin/models` · `GET /api/admin/models/[id]` · `GET /api/admin/enquiries` · `PATCH /api/admin/enquiries/[id]` · `GET /api/admin/enquiries/export` · `GET /api/admin/analytics/summary` · `GET/PUT /api/admin/settings`.

Rules: zod on every input, consistent JSON errors, rate limiting on public POSTs, no admin data in public responses. Public pages read data directly in server components, not over HTTP.

Data model: Product, ProductVariant, Category, ProductImage, Model3D (sourceUrl, glbUrl, arGlbUrl, usdzUrl?, posterUrl, status, sizeBytes, triangleCount, placement `ceiling|wall|floor`, hangHeightCm, dropLengthCm, realDimensionsCm, warnings), Enquiry, AnalyticsEvent, AdminUser, SiteSettings.

## 6. 3D + AR rules

1. **Real scale is mandatory.** Models in metres. Warn if the bounding box differs from the admin dimensions by more than 3%, and offer "fix scale automatically".
2. **Pipeline:** validate → fix scale → dedupe/prune → weld → simplify if over budget → Draco → resize textures (max 2048 px; WebP for web GLB only) → save web GLB + AR GLB(s) → save stats. Job record in the DB (queued / processing / done / failed). `scripts/process-model.ts` for running locally.
3. **Hanging jhoomars:** for `placement = ceiling`, the AR GLB has its origin at floor level, with the geometry lifted so the top sits at ceiling height, plus the floor marker disc. Hint: "Point your camera at the floor below where the jhoomar will hang."
4. **iPhone:** model-viewer's automatic USDZ by default; admin may upload a custom USDZ.
5. **Experimental WebXR** (Android Chrome, flag off by default) with ceiling detection + height slider; always fall back.
6. **Budgets:** GLB ≤ 5 MB (hard max 8 MB), ≤ 150k triangles, AR starts < 3 s on mid-range Android over 4G. Lazy-load the viewer; poster first.
7. **Looks:** PBR; metal metallic; crystals transmission with a fallback; bulbs emissive. UI note: the AR preview doesn't light up the real room.
8. **Poster:** generated in the admin preview via `toBlob()` and uploaded.
9. **Placeholder:** procedural jhoomar generator in `lib/three-d/placeholder.ts`.
10. Model sources: client/manufacturer files or a 3D artist. AI image-to-3D = phase 2.

## 7. SEO (top priority)

Server-rendered pages (static shell + `use cache` + on-demand revalidation on admin save) · `generateMetadata` everywhere (title, description, canonical, OG/Twitter) · clean URLs `/products/[slug]`, `/category/[slug]` · JSON-LD: Organization, LocalBusiness, Product (INR offers), BreadcrumbList, FAQPage · `app/sitemap.ts` from the DB, `app/robots.ts`, `/admin` + `/api` noindex/disallowed · LCP < 2.5 s, CLS < 0.1, viewer never blocks first paint · Lighthouse SEO ≥ 90, performance ≥ 85 on product pages · semantic HTML, alt text, one H1, internal links · SEO character counters in admin.

## 8. Sub-agents

See `.claude/agents/`: `architect`, `api-backend`, `three-d-ar`, `site-frontend`, `admin-panel`, `qa-tester`. Agents don't edit files owned by another agent without the lead's approval.

## 9. Definition of done

`npm run check` (tsc + lint + unit tests) passes and `npm run build` succeeds · every route handler has tests; every admin route checks the session · mobile-first (360 px) + desktop · every model passes gltf-validator + the budget · device checklist in `docs/device-testing.md` · design: clean, premium, minimal, warm brass accent, serif headings + sans body · `docs/admin-guide.md` in simple language.

## 10. Milestones

- **M0 – Setup** · **M1 – Demo** (placeholder jhoomar, 3D, hanging AR on Android + iPhone, QR on desktop, deployable) · **M2 – Data + API** · **M3 – Admin panel** · **M4 – Public website** · **M5 – Hardening + deploy** · **Phase 2:** Razorpay, Hindi, ceiling detection, AI image-to-3D.

## 11. What you cannot do

Test camera/AR on a real phone (give a checklist) · create accounts or pay for services (say exactly what to create and which env vars to fill) · produce photo-real models from nothing (use the placeholder generator).

## Commands

- `npm run dev` — local dev server
- `npm run check` — typecheck + lint + unit tests
- `npm run build` — production build
- `npm run e2e` — Playwright tests
- `npm run model:placeholder` — regenerate the placeholder jhoomar GLBs into `public/models/`
- `npm run db:migrate` / `npm run db:studio` — Prisma
- `npm run admin:create -- --email you@example.com` — create an admin user
