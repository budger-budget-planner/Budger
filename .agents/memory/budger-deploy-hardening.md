---
name: Budger deployment-hardening audit
description: What was fixed across the phased deployment-readiness audit (security, error handling, transactions, pagination) — check before re-flagging these as open issues
---

## Context

A deployment-readiness audit scored the app 47/100 and listed blockers/high/medium issues. Fixes were executed in phases, confirmed by code review, with the user approving each phase before the next.

## What is now fixed (do not re-flag without checking current code first)

- CORS whitelist (was `origin: true`), Helmet, session cookie `secure`/`httpOnly`/`sameSite`, hard-fail on missing/default `SESSION_SECRET` in production, graceful SIGTERM/SIGINT shutdown — `artifacts/api-server/src/app.ts` / `index.ts`.
- Global Express error handler + `/api` 404 fallback + process-level `unhandledRejection`/`uncaughtException` handlers — a bad request or DB error in any route can no longer crash the whole process (Express 5 already forwards async rejections to `next(err)`, so per-route try/catch wasn't required once the global handler existed).
- `drizzle-kit push --force` on boot now no-ops when `NODE_ENV === "production"` (only runs in dev/remix) — was previously unconditional and could destructively mutate a live schema.
- IDOR fixed on `GET/DELETE /transactions/:id`, both receipt endpoints, and the Apple Pay webhook result endpoint (`/webhook/result/:token/:txId` — token was validated but the transaction lookup wasn't scoped to that token's user).
- `/splits/:id/accept`: wrapped in `db.transaction()`; the accept is now a conditional `status='pending'` update inside the transaction so two concurrent accepts can't both create a recipient transaction (was a real race).
- Goal deletion (larder refunds + contribution/proposal/goal row deletes) wrapped in `db.transaction()` for atomicity.
- N+1 fixed in `splits.ts` enrichment (was 3 queries per split; batched via `inArray`).
- Pagination added to `GET /goals/past` (limit clamped `[1,500]`, offset `>=0`) and `GET /summary/history` (`months` clamped `[1,120]`) — `/transactions` already had limit/offset from an earlier pass.

## Still open (lower priority, explicitly deferred)

- FK cascade constraints not audited/added.
- In-memory rate limiter on `/auth/check-email` resets on server restart (not moved to a durable store).
- DB index coverage confirmed only for the transactions table; other tables not individually re-verified in the latest pass.

**Why this file exists:** the same audit findings could otherwise be re-discovered and "re-fixed" (or assumed still broken) in a future session without re-reading the diffs — check this list first.
