# JhoomAR

**See it hanging in your room before you buy.**
One Next.js 16 project: the public website, the API (route handlers) and the admin panel at `/admin`.
Customers rotate each jhoomar in 3D and tap **View in your room** on their phone to see it hanging from their own ceiling, at real size — no app.

> Project rules and the full brief live in [`CLAUDE.md`](CLAUDE.md). Decisions: [`docs/decisions.md`](docs/decisions.md).

## Status

| Milestone | State |
|---|---|
| M0 – Setup | ✅ Next.js 16, Tailwind 4, shadcn/ui, Prisma 7 + Postgres, Better Auth (admin login), storage (local + R2), Vitest, Playwright |
| M1 – Demo | ✅ `/products/demo-jhoomar`: procedural placeholder jhoomar, 3D viewer, hanging AR for 9/10/11/12 ft ceilings (Android Scene Viewer + iPhone Quick Look), QR code on desktop. **Needs real-phone testing** → [`docs/device-testing.md`](docs/device-testing.md) |
| M2–M5 | Not started |

## Run it locally

Needs Node 22.12+ and PostgreSQL (Homebrew `postgresql@17` works).

```bash
npm install
cp .env.example .env.local          # then fill DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
createdb jhoomar_dev
npm run db:migrate
npm run admin:create -- --email you@example.com --name "Your Name"
npm run dev                          # http://localhost:3000/products/demo-jhoomar
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run check` | Typecheck + lint + unit/API tests |
| `npm run build` / `npm start` | Production build / server |
| `npm run e2e` | Playwright tests (desktop, Android, iPhone, 360 px) against a production build on :3100, using the `jhoomar_test` database (`createdb jhoomar_test` once) |
| `npm run model:placeholder` | Regenerate the demo jhoomar: `public/models/demo-jhoomar/` (web GLB, 4 hanging AR GLBs, 4 iPhone USDZ, poster + gallery images) |
| `npm run model:process -- --in file.glb --out public/models/x --width 80 --height 130 [--fix-scale]` | Process a real model locally (same pipeline) |
| `npm run admin:create -- --email …` | Create an admin or reset their password |
| `npm run db:migrate` / `db:deploy` / `db:studio` | Prisma |

First time running `e2e` or `model:*`: `npx playwright install chromium webkit`.

## How the hanging AR works (short)

Android's Scene Viewer and iPhone's AR Quick Look can only place a model **on the floor**. So for each ceiling height we pre-build an AR file where:

1. the jhoomar is lifted so its **canopy touches the ceiling** (e.g. 3.05 m for 10 ft), and
2. a faint **circle sits on the floor** (y = 0) under it.

Both viewers rest the bottom of the model's bounding box — the circle — on the floor, so the jhoomar appears at the right height. Size is locked (`ar-scale="fixed"`). Details: [`docs/decisions.md`](docs/decisions.md).

## Folders

```
app/(site)/        public website          app/admin/      admin panel
app/api/           route handlers          proxy.ts        /admin guard (optimistic)
components/viewer/ 3D viewer, AR button, QR    components/site, admin, ui
lib/three-d/       3D pipeline (gltf-transform)    lib/storage/   local + R2
prisma/            schema + migrations     scripts/        CLI tools
tests/             unit, api, e2e          docs/           decisions, device testing, deploy, admin guide
.claude/agents/    sub-agent definitions
```

## Deploy

See [`docs/deploy.md`](docs/deploy.md) (Vercel) and [`docs/accounts-and-env.md`](docs/accounts-and-env.md) (every account and env var, in order).
