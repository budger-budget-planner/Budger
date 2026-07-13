---
name: Neon DB cutover
description: How this app moved its primary Postgres from Replit-managed to Neon, and the pitfalls hit doing it.
---

The app's primary database is now Neon Postgres (`NEON_DATABASE_URL` secret), not Replit's built-in Postgres.

- `DATABASE_URL` is a platform-managed key on Replit — never overwrite it directly. Instead, `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` compute a resolved `DATABASE_URL = NEON_DATABASE_URL || DATABASE_URL` constant and export/use that everywhere. Any code that needs the DB connection string (api-server startup checks, the `connect-pg-simple` session store, etc.) must import this resolved constant from `@workspace/db` — reading `process.env.DATABASE_URL` directly in those files silently reverts to the old Replit DB.
- After adding a new export to `lib/db`, its composite TypeScript project must be rebuilt (`tsc -b`) before downstream packages' typecheck picks up the new symbol from `dist/index.d.ts`.
- Migration mechanics: `pg_dump` (custom format) from the old DB → `pg_restore --no-owner --no-privileges` into Neon. A `\dt` check showing 0 tables right after restore was a red herring (stale/quiet-mode read) — re-running `pg_restore` and seeing "already exists" errors is the real confirmation the first run succeeded. Verify with actual row counts per table instead of trusting one `\dt`.
- User-pasted secrets (Neon password, Supabase service_role key) that appear in plain chat should be flagged for rotation even after being moved into proper secrets — pasting alone counts as exposure.

**Why:** Replit's `DATABASE_URL` is runtime-managed infrastructure; overwriting it directly breaks the platform's assumptions and could get reset. The resolved-constant pattern lets Neon take over cleanly while leaving that key alone.
