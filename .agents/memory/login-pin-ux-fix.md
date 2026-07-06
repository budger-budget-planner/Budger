---
name: Login PIN UX fix & session persistence
description: Root cause analysis and fixes for recurring "can't log in" issue with established PIN
---

## The bugs

### 1. 15-second submit-button timer (frontend)
`Login.tsx` showed the manual submit button only after 15 s. When `loginPinLength` is null (check-email failed, server down, or pinLength was never backfilled), auto-submit never fires. Users typed their PIN, nothing happened, gave up after <15 s.

**Fix:** `showPinSubmit` is now a computed value:
- If `loginPinLength` is known → show at that exact count (same moment auto-submit fires, acts as visible fallback)
- If `loginPinLength` is null → show as soon as 4 digits are typed

### 2. In-memory session store (backend)
`express-session` used default `MemoryStore`. Every API server restart (esbuild rebuild, workflow restart) wiped ALL sessions. Users were constantly kicked to login screen and had to re-authenticate.

**Fix:** Added `connect-pg-simple` store backed by PostgreSQL. Sessions now persist across restarts. Falls back to MemoryStore if `DATABASE_URL` is absent.

**Important gotcha:** `connect-pg-simple`'s `createTableIfMissing: true` reads a `table.sql` file relative to its module using `__dirname`. After esbuild bundling, `__dirname` resolves to `dist/` and the file isn't there, so the table is never created and sessions silently fail. The fix: set `createTableIfMissing: false` and manually run `CREATE TABLE IF NOT EXISTS "sessions" ...` in `index.ts` startup using the exported `pool` from `@workspace/db` before calling `app.listen`.

### 3. signupExpiresAt not cleared after registration
`POST /auth/register` set `passwordHash` + `pinLength` but left `signupExpiresAt` from the original `register-start`. Fully registered users still had a past timestamp in that column. Not immediately dangerous (purge only deletes `passwordHash IS NULL` rows), but defensive cleanup warranted.

**Fix:** `.set({ passwordHash, pinLength, signupExpiresAt: null })` in the register endpoint. Also added null-check on returned `updated` row to prevent a crash if the row was deleted between select and update.

## What was NOT changed
The actual `passwordHash` values in DB are valid bcrypt hashes. The recurring "Incorrect password" issue is ultimately explained by users not knowing their current PIN (either they set a new PIN via forgot-pin and forgot it, or the DB was reset at some point). The code changes make login UX much more forgiving so users can always reach the submit button.

**Why:** Without the 15 s fix, any scenario where `pinLength` was null (e.g., column added after user registration, check-email network failure) made login appear completely broken.
