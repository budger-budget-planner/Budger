---
name: Drizzle migration system
description: Schema changes now use drizzle-kit generate + migrate() instead of push --force; covers baseline logic, advisory lock, and build step.
---

## The rule
New schema changes: edit `lib/db/src/schema/`, run `pnpm --filter @workspace/db run generate`, commit the `.sql` file. The next server startup applies it automatically.

## How it works at startup (`artifacts/api-server/src/index.ts`)
1. Acquire `pg_advisory_lock(987654321)` to serialize concurrent startups.
2. `baselineLegacyPushDatabase()` — if ≥10 app tables exist but `drizzle.__drizzle_migrations` does not, insert a baseline record with `created_at = 1783712380090` (the `when` of migration `0000_past_blazing_skull`) so `migrate()` skips re-running it.
3. `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator`.
4. Release advisory lock.

## Build step (`artifacts/api-server/build.mjs`)
`lib/db/migrations/` is copied to `dist/migrations/` so the production bundle doesn't need the source tree.

## Migrations folder
`lib/db/migrations/0000_past_blazing_skull.sql` — initial full-schema migration generated from the state after FK constraints were added.
Journal `when` timestamp: `1783712380090`.

**Why:** `push --force` overwrites with no history, fails in production, and can silently destroy data. Migrations are reviewable, reversible, and production-safe.

**How to apply:** The baseline path fires once per legacy database (those managed by push). Fresh databases go through normal `migrate()` from scratch.
