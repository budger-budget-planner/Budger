# Budger — Backend (API server)

Express 5 + Drizzle ORM JSON API. Session-cookie auth, Postgres (Neon), file
uploads to Supabase Storage.

## Requirements

- Node.js 22+
- A Postgres database (Neon recommended — this app already uses one)
- A Supabase project with a **public** storage bucket for receipt images

## Setup

```bash
npm install
cp .env.example .env   # fill in the values — see comments in the file
npm run db:push        # or db:migrate, if you're tracking migrations
npm run build
npm start
```

For local development: `npm run dev` (runs `src/index.ts` directly via `tsx`,
no build step, restarts are manual — re-run the command after changes).

## Deploying

This is a plain Node/Express app — deploy it to any Node host that lets you
run a long-lived process: Render, Railway, Fly.io, a VPS, etc. It is **not**
a serverless function (it holds a Postgres connection pool and runs
background schedulers), so serverless platforms (bare Vercel/Netlify
functions) are not a good fit for this piece.

1. Push this folder to its own git repo (or a subfolder your host can build
   from).
2. Set the environment variables from `.env.example` in your host's
   dashboard. At minimum: `DATABASE_URL`, `SESSION_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`.
3. Build command: `npm run build`. Start command: `npm start`.
4. Once you have a live URL (e.g. `https://budger-api.onrender.com`), set:
   - `FRONTEND_URL` — your deployed frontend's origin, used to build email
     links (verification, PIN reset) that must point at the frontend, not
     this API.
   - Either point the frontend's `vercel.json` rewrite at this URL (no CORS
     config needed — recommended, see `frontend/README.md`), **or** set
     `CORS_ORIGINS` to the frontend's origin if you're calling this API
     cross-origin directly from the browser.

## Notable env vars

See `.env.example` for the full, documented list. The database and file
storage connections were already migrated and verified working — reuse the
same `NEON_DATABASE_URL`/`DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_BUCKET` values from your Replit
project's secrets when moving to your new host, or rotate them first if
they were ever shared in plaintext (recommended either way).

## Structure

- `src/routes/` — one file per resource (auth, transactions, categories, …)
- `src/db/` — Drizzle schema + connection (flattened from the original
  monorepo's shared `@workspace/db` package)
- `src/api-zod/` — Zod request/response schemas (flattened from
  `@workspace/api-zod`)
- `migrations/` — Drizzle SQL migrations, applied automatically on startup
- `src/scripts/migrate-receipts.ts` — one-time backfill script, safe to
  re-run, moves any leftover base64 receipt images into Supabase Storage
