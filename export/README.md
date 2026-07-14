# Budger — Standalone Deployment Package

This is Budger, split out of its original pnpm monorepo into two independent,
deployable projects:


- **`frontend/`** — React + Vite PWA. Deploy to Vercel.
- **`backend/`** — Express API + Postgres (Neon) + Supabase Storage. Deploy
  to any Node host (Render, Railway, Fly.io, a VPS, …).

Each folder is self-contained: its own `package.json` with pinned real
dependency versions (no workspace/catalog references), its own `tsconfig.json`,
and no dependency on the other folder or on the original monorepo.

## Recommended deploy order

1. **Backend first** — follow `backend/README.md`. You need its live URL
   before finishing the frontend setup.
2. **Frontend second** — follow `frontend/README.md`, plugging the backend's
   URL into `frontend/vercel.json`.

## What changed from the monorepo version

- Shared packages (`@workspace/db`, `@workspace/api-zod`,
  `@workspace/api-client-react`) were copied in as local source
  (`backend/src/db`, `backend/src/api-zod`, `frontend/src/lib/api-client`)
  with imports rewritten to relative paths — no workspace protocol, no pnpm
  catalog.
- Replit-specific Vite plugins (cartographer, dev banner, runtime error
  overlay) and the `BASE_PATH`/artifact-routing logic were removed from
  `vite.config.ts` — this app now always deploys at the domain root.
- Email links that must point at the frontend (email verification, PIN
  reset) now resolve via a `FRONTEND_URL` env var instead of Replit's
  `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN` (see `backend/src/lib/frontend-origin.ts`).
  Both are still checked as a fallback in case you deploy this back onto
  Replit — the priority is `FRONTEND_URL` → Replit env vars → request host.
- Nothing about the database or file storage logic changed — this package
  already talks to Neon Postgres and Supabase Storage directly, not to any
  Replit-managed service.
