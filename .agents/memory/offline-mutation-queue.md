---
name: Offline mutation queue (Phase 2)
description: Architecture and key decisions for the IndexedDB mutation queue, useMutationWithQueue hook, and Background Sync integration.
---

## Replay ordering & error classification
- Replay stops on the FIRST failure to preserve FIFO ordering.
- 4xx → terminal: mark op `failed` (excluded from future `listPending`), stop.
- 5xx / network error → transient: leave op `pending`, stop.
- 404 on DELETE → treat as success (resource already removed).

## Web Locks for concurrent drain prevention
- Both `useQueueReplay` (window `online` event) and the SW Background Sync can
  call `replayQueue`. Use Web Locks (`LOCK_NAME = "budger-mutation-queue-replay"`)
  to prevent concurrent drains.
- `withReplayLock(fn)` exported from `mutation-queue.ts`; used in both
  `useQueueReplay.ts` and inline in `sw.ts`.
- `navigator.locks.request` requires `as unknown as Promise<T>` cast to avoid
  TS2322 (Promise<Promise<T>> overload inference issue).

## useMutationWithQueue hook
- Returns `{ mutate(vars, overrides?), isPending, wasQueued }`.
- `mutate(vars, overrides?)` accepts optional per-call `{ onSuccess, onError }` —
  mirrors TanStack Query's `mutate(vars, options)` API so pages need minimal changes.
- Offline path: awaits `enqueue` before showing success UX; shows error toast if
  IDB write fails (previously was fire-and-forget → silent data loss).
- Per-call `overrides.onSuccess` is intentionally SKIPPED offline (needs server
  data like `tx.id`). Opts-level `onSuccess` IS called (for closing dialogs etc.).
- `onSuccess(data: unknown, vars: TVars)` — data is parsed JSON or `undefined` for 204.
  Pages using no-arg callbacks `() => {...}` work fine (TS allows fewer params).

## Endpoints queued (per spec)
- POST/PATCH/DELETE `/api/transactions`
- POST/DELETE `/api/goal-contributions`
- POST `/api/larder/entries`, DELETE `/api/larder/entries/:id`
- POST `/api/larder/spend`, POST `/api/great-larder/send`, POST `/api/larder/dedicate-to-goal`
- POST/PATCH/DELETE `/api/recurring-payments`
- PATCH `/api/auth/me`

## Deliberate omissions
- Household invite, category share proposal, delete account — excluded per spec.
- tx.id-dependent goal contributions after offline tx creation are NOT queued
  (sequential dependency, acceptable UX limitation for Phase 2).

## SW Background Sync
- Registered under tag `"budger-mutation-queue"`.
- SW replay logic is INLINED in `sw.ts` (not imported from mutation-queue.ts)
  to avoid any Vite alias / SW compilation issues.
- SW uses same stop-on-failure and lock semantics as the main-thread replay.

## IndexedDB schema
- DB: `"budger-offline"`, store: `"mutation_queue"`, version: 1.
- Op fields: `{ id, endpoint, method, payload, timestamp, status, error? }`.
