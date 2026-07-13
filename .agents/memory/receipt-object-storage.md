---
name: Receipt file storage (Supabase)
description: How receipt images are stored and served — Supabase Storage, direct public URLs, no proxy route.
---

Receipts upload directly to a **public** Supabase Storage bucket (`budger-media`) via `@supabase/supabase-js`, server-side, using the service role key (bypasses bucket RLS for writes/deletes). No signed URLs, no GCS, no auth-gated serving proxy.

- Upload: `POST /transactions/:id/receipt` decodes the incoming base64 data URL and calls `ObjectStorageService.uploadObjectEntity(buffer, contentType)` (`artifacts/api-server/src/lib/objectStorage.ts`), which uploads to `uploads/<uuid>.<ext>` and returns the permanent public URL. That URL — not base64 — is what gets stored in `transactions.receiptImage`.
- Delete: `uploadObjectEntity`'s counterpart `deleteObjectEntity(url)` parses the object path back out of a public URL and removes it; it's a safe no-op for URLs that don't belong to the bucket (e.g. leftover legacy base64 values), so it's safe to call unconditionally on delete/replace.
- Display: `receiptSrc(value)` in `imageUtils.ts` — `data:` legacy base64 as-is, `http`-prefixed Supabase public URLs as-is (loaded directly by the browser, no backend proxy).
- No `GET /storage/objects/*` proxy exists anymore — was removed because the bucket is public, so there's nothing for a session-gated proxy to protect. If receipts ever need to become private again, that ownership-check pattern (join against `transactions.receiptImage` + `userId`) is the one to bring back, alongside switching the bucket to private + signed URLs.
- One-time backfill: `artifacts/api-server/src/scripts/migrate-receipts.ts` converts any remaining base64 rows to real Supabase objects; safe to re-run (skips non-`data:` rows).

**Why:** user explicitly requested files go straight into their own Supabase project via the official SDK, and confirmed the bucket is intentionally public — simplifying away the previous GCS proxy/ACL machinery entirely.
