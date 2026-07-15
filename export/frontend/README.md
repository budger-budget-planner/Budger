# Budger — Frontend (React + Vite PWA)

React 19 + Vite 7 + Tailwind v4 progressive web app. Talks to the Budger
backend over `/api/...` (relative paths — see "Connecting to the backend"
below for how that resolves in production).

## Local development

```bash
npm install
cp .env.example .env   # optional — only VITE_SENTRY_DSN currently
npm run dev
```

The dev server expects a backend running locally too (see
`../backend/README.md`) and proxies nothing on its own — for local dev, run
Vite and the API on the same origin, or edit `vite.config.ts` to add a
`server.proxy` rule for `/api`.

## Deploying to Vercel

1. Push this folder to its own git repo, import it into Vercel.
2. Framework preset: **Vite**. Vercel will pick up `vercel.json` in this
   folder automatically — no further config needed there.
3. **Before your first deploy**, deploy the backend (see
   `../backend/README.md`) and grab its live URL.
4. Open `vercel.json` and replace `REPLACE_WITH_YOUR_BACKEND_URL` in the
   `rewrites` block with your backend's real domain, e.g.:
   ```json
   { "source": "/api/:path*", "destination": "https://budger-api.onrender.com/api/:path*" }
   ```
   This makes Vercel transparently proxy `/api/*` calls to your backend.
   Because the browser only ever talks to your Vercel domain, session
   cookies work with **zero CORS configuration** — this is the recommended
   setup and matches how the app already calls its API (relative `/api/...`
   paths, no code changes needed).
5. Add `VITE_SENTRY_DSN` in Vercel's project settings if you use Sentry
   (optional — the app runs fine without it).
6. Deploy.

### Alternative: fully cross-origin (no rewrite proxy)

If you'd rather call the backend directly from the browser (different
domain, no Vercel proxy), set `CORS_ORIGINS` on the backend to this app's
Vercel URL, and call
`import("@/lib/api-client").setBaseUrl("https://your-backend-url")` once at
app startup (e.g. in `src/main.tsx`) — then remove the `/api` rewrite from
`vercel.json` (keep the SPA fallback rewrite). Note this path still needs
a few of the app's raw `fetch()` calls (outside the generated API client) to
be pointed at the same backend origin — the default rewrite-proxy setup
above avoids that entirely and is recommended unless you have a specific
reason not to use it.

## PWA notes

- The service worker (`src/sw.ts`) and `public/manifest.json` assume the app
  is deployed at the domain root (`/`), which matches a standard Vercel
  deployment. If you ever deploy under a sub-path instead, you'll need to
  update `start_url` in `manifest.json` and the icon paths accordingly.
- Build output goes to `dist/` (Vercel's default expectation for a Vite
  app — already set as `outputDirectory` in `vercel.json`).

## Structure

- `src/pages/`, `src/components/` — app UI
- `src/lib/api-client/` — generated React Query hooks + Zod schemas
  (flattened from the original monorepo's shared `@workspace/api-client-react`
  package), imported as `@/lib/api-client`
- `src/sw.ts` — PWA service worker (push notifications, offline mutation
  queue)

