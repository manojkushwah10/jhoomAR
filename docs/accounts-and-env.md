# Accounts, services and environment variables

In the order you'll need them. Nothing here costs money until **Production hosting** (M5).

## 1. Local development (now) — no accounts

`.env.local` (copy from `.env.example`):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Shop WhatsApp number, country code + digits, e.g. `919876543210` |
| `NEXT_PUBLIC_AR_WEBXR_EXPERIMENTAL` | `false` |
| `DATABASE_URL` | `postgresql://<your-mac-username>@localhost:5432/jhoomar_dev` |
| `DIRECT_URL` | empty |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `STORAGE_DRIVER` | `local` |

## 2. Demo link (M1) — GitHub + Vercel (free)

1. **GitHub**: create a **private** repository (e.g. `jhoomar`). I'll give you the push commands.
2. **Vercel** (Hobby/free): sign up with GitHub → *Add New → Project* → import the repo.
3. **Neon** (free, recommended now so `/admin` login works on the demo): create a project, region **AWS Asia Pacific (Mumbai)**. Copy both connection strings.

Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** string (host contains `-pooler`) |
| `DIRECT_URL` | Neon **direct** string |
| `BETTER_AUTH_SECRET` | a **new** `openssl rand -base64 32` (not the local one) |
| `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | shop number |
| `STORAGE_DRIVER` | `local` for now (no uploads until M3) |

## 3. File storage (M3) — Cloudflare R2

1. Cloudflare account → **R2** → create bucket `jhoomar-media` (location: Asia-Pacific).
2. Bucket → Settings → **Public access**: connect a custom domain (e.g. `media.yourdomain.in`) — or enable the `r2.dev` URL for testing.
3. Bucket → Settings → **CORS policy**: I'll provide the JSON (allows browser uploads from your site and model downloads by Scene Viewer).
4. R2 → **Manage API tokens** → create a token with *Object Read & Write* on this bucket only.

| Variable | Value |
|---|---|
| `STORAGE_DRIVER` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | from the API token |
| `R2_BUCKET` | `jhoomar-media` |
| `R2_PUBLIC_BASE_URL` | `https://media.yourdomain.in` (no trailing slash) |

## 4. Launch (M5)

- **Domain** (e.g. from Cloudflare Registrar) → point it to Vercel, then update `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL`.
- **Production hosting** — ⚠️ paid: Vercel **Pro** (about $20/month; Hobby doesn't allow commercial sites) or a Node host such as Railway/Render.
- **Google Search Console**: verify the domain, submit `/sitemap.xml`.
