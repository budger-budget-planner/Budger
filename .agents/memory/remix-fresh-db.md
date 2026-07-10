---
name: Remix fresh-DB schema auto-push
description: Why login breaks after a Replit remix and how it's permanently fixed
---

## The problem

When a Replit project is remixed (forked), Replit provisions a brand-new, empty PostgreSQL database and sets DATABASE_URL automatically. The schema tables do NOT exist in this fresh database. The API server starts successfully, but every database query throws "relation does not exist", causing all API routes to return 500 errors. Login appears completely broken.

The symptom on the frontend: `check-email` fails → the catch block silently advances to the PIN screen → the login attempt also fails → user sees "Failed to sign in" with no explanation.

## The fix

`artifacts/api-server/src/index.ts` calls `ensureDbSchema()` before `app.listen()`. It runs:

```
pnpm --filter @workspace/db run push-force
```

(`push-force` = `drizzle-kit push --force`, which skips interactive prompts.)

This is idempotent — on an existing database drizzle-kit detects no diff and exits in ~1–2 seconds. On a fresh database it creates all tables. The server only starts accepting connections after the push completes.

`scripts/post-merge.sh` was also corrected from `pnpm --filter db push` (wrong package name, interactive prompts) to `pnpm --filter @workspace/db run push-force`.

**Why:** Without this, every remix is a silent failure requiring a manual `pnpm --filter @workspace/db run push` run that no new user would know to do.

**How to apply:** Runs automatically on every dev startup. If drizzle-kit push somehow fails, the server continues (warning logged) so a schema error never prevents startup.

**Production update (2026-07-10):** `push --force` diffs and can destructively mutate a live schema (drop/recreate a column it can't reconcile), so it must never run automatically once the app has real user data. `ensureDbSchema()` now no-ops when `NODE_ENV === "production"` and logs that schema changes require a deliberate, reviewed step instead. This only affects the dev/remix convenience path — production deploys must apply schema changes manually/reviewed before deploying.
