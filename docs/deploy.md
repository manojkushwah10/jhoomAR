# Deploying

## Quick demo on Vercel — no database, no admin

The public website (home, product page, 3D, "View in your room", QR) needs **no database and no secrets**. Admin is switched off automatically and `/admin/login` says "Admin login isn't set up on this website yet."

1. Commit and push to a private GitHub repo.
2. Vercel → *Add New → Project* → import the repo → **Deploy** (no settings to change).
3. Optional env vars (Settings → Environment Variables, then *Redeploy*):
   - `NEXT_PUBLIC_WHATSAPP_NUMBER` — e.g. `919876543210` (otherwise a placeholder number is used)
   - `NEXT_PUBLIC_SITE_URL` — `https://<project>.vercel.app` (Vercel's own production URL is used if empty; set it to be explicit)
4. Do **not** set `DATABASE_URL` or `BETTER_AUTH_SECRET` until you want admin — then follow the full steps below.

Checked locally with every env var empty: build passes with no errors or warnings, all pages return 200, `.glb`/`.usdz` are served as `model/gltf-binary` / `model/vnd.usdz+zip`, the QR code points at the Vercel URL, and the auth API answers 503 `admin_not_configured`.

## Vercel (full, with admin)

1. Push the repo to GitHub (private):
   ```bash
   git remote add origin git@github.com:<you>/jhoomar.git
   git push -u origin main
   ```
2. Vercel → *Add New → Project* → import the repo. Framework: Next.js (auto). Keep the default build command — `npm install` runs `prisma generate` automatically.
3. Add the environment variables from [`accounts-and-env.md`](accounts-and-env.md) §2.
4. Create the tables in Neon once, from your Mac:
   ```bash
   DATABASE_URL="<neon pooled>" DIRECT_URL="<neon direct>" npx prisma migrate deploy
   DATABASE_URL="<neon pooled>" npm run admin:create -- --email owner@example.com --name "Owner"
   ```
5. Deploy. Open `https://<project>.vercel.app/products/demo-jhoomar`.

Every push to `main` redeploys; other branches get **preview URLs** (handy for phone testing).

The `.glb`/`.usdz` content types and CORS headers that Scene Viewer and Quick Look need are set in `next.config.ts` and work on Vercel as-is.

## Alternative: any Node host (Railway, Render, VPS)

```bash
npm ci && npx prisma migrate deploy && npm run build && npm start   # PORT env var respected
```
Set the same environment variables. Use this if model processing (M3) outgrows Vercel's function limits.

## Testing on a phone before deploying

Phones can't open `localhost`, and Scene Viewer downloads the model itself, so the simplest route is a **Vercel preview URL** (push a branch). A tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) also works, but it's a global install — ask first.
