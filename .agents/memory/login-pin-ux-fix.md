---
name: Login PIN UX fix & session persistence
description: Root cause analysis and fixes for recurring "can't log in" issue with established PIN
---

## The bugs

### 1. Submit-button timer (frontend)
`Login.tsx` shows the manual submit button after a delay (currently 5 s) so the digit count doesn't leak the PIN length. The button is now rendered inside PinKeyboard's bottom-left grid slot (replacing the empty spacer), not below the keyboard — user preference, do not move back below.

**Props added to PinKeyboard:** `showSubmit`, `onSubmit`, `submitLabel`, `submitDisabled`.

### 2. In-memory session store (backend)
`express-session` used default `MemoryStore`. Every API server restart wiped ALL sessions.

**Fix:** Added `connect-pg-simple` store backed by PostgreSQL. Sessions persist across restarts. Falls back to MemoryStore if `DATABASE_URL` is absent.

**Important gotcha:** `connect-pg-simple`'s `createTableIfMissing: true` reads a `table.sql` file relative to its module using `__dirname`. After esbuild bundling, `__dirname` resolves to `dist/` and the file isn't there, so the table is never created and sessions silently fail. The fix: set `createTableIfMissing: false` and manually run `CREATE TABLE IF NOT EXISTS "sessions" ...` in `index.ts` startup using the exported `pool` from `@workspace/db` before calling `app.listen`.

### 3. Session write-after-response race (the recurring "can't log in" root cause)
`express-session` saves the session asynchronously via a `res.end` hook — the HTTP response can be sent to the client *before* the session row is committed to PostgreSQL. When the frontend receives the login success response and immediately calls `/api/auth/me` (via `queryClient.invalidateQueries`), the session row may not exist yet → 401 → redirect back to login. This is why login appeared to "succeed" then immediately kick the user out.

**Fix:** Explicitly `await req.session.save()` before `res.json()` in both `POST /auth/login` and `POST /auth/register`. This blocks the response until PostgreSQL has committed the session.

**Why:** Without the explicit save, any fast client (React Query, SPA navigation) can race ahead of the DB write. Must be applied on every endpoint that first establishes a session.

### 4. PIN cleared on network/server errors (frontend)
`onError` cleared `loginPin` unconditionally. On network failures the user had to retype their PIN every attempt, and if auto-submit re-fired immediately on retype it looped.

**Fix:** Only call `setLoginPin("")` on credential errors (401 Incorrect / 404 No account). Leave the PIN intact on network/server errors so the user can retry via Continue without retyping.

### 5. signupExpiresAt not cleared after registration
`POST /auth/register` left `signupExpiresAt` set. **Fix:** `.set({ passwordHash, pinLength, signupExpiresAt: null })`.

## What was NOT changed
The actual `passwordHash` values in DB are valid bcrypt hashes. The recurring "Incorrect password" issue when DB is reset is explained by users not knowing their PIN was changed.

**Why:** The session race (bug 3) was the primary cause of the "login always blocked" report.
