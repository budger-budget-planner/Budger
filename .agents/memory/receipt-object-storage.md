---
name: Receipt object storage migration
description: How receipt images are stored and served after migration from base64 to GCS object storage.
---

receipts were previously stored as base64 data URLs directly in `transactions.receiptImage` (text column). Now:

- New uploads: presigned URL flow → file goes to GCS → objectPath (e.g. `/objects/uploads/uuid`) stored in `receiptImage`
- Legacy rows: base64 `data:image/...` strings still in DB — supported transparently
- Display: `receiptSrc(value)` in `imageUtils.ts` — returns base64 as-is, prefixes `/api/storage` for objectPaths
- Serving URL: `/api/storage/objects/uploads/uuid` → `GET /storage/objects/*path` route in storage.ts
- Auth: **both** the upload URL endpoint and the object serving endpoint use `req.session.userId` session check — NOT passport's `req.isAuthenticated()` (which is not configured in this app)
- Migration script: `artifacts/api-server/src/scripts/migrate-receipts.ts` — skips rows already starting with `/objects/`

**Why:** The storage.ts template uses `req.isAuthenticated()` (passport pattern) but this app uses session-based auth. Always replace with `(req.session as any)?.userId` guard when using the object-storage skill template here.
