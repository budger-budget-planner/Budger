/**
 * In-memory store for receipt uploads in transit.
 *
 * The old client flow is:
 *   1. POST /storage/uploads/request-url  → gets { uploadURL, objectPath }
 *   2. PUT  uploadURL                     → sends raw file bytes
 *   3. POST /transactions/:id/receipt     → sends { imageData: objectPath }
 *
 * Rather than requiring object storage (PRIVATE_OBJECT_DIR), we intercept at
 * step 2, convert the raw bytes to a base64 data URL, and cache it here keyed
 * by UUID.  Step 3 then resolves the objectPath back to the base64 string and
 * stores it directly in the transactions.receipt_image column.
 *
 * Entries expire after 10 minutes and are deleted on first read (one-time use).
 */

const TTL_MS = 10 * 60 * 1000;

interface Entry {
  dataUrl: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

export function setPendingUpload(uuid: string, dataUrl: string): void {
  sweep();
  store.set(uuid, { dataUrl, expiresAt: Date.now() + TTL_MS });
}

/** Returns the data URL and removes the entry (one-time use). */
export function popPendingUpload(uuid: string): string | null {
  const entry = store.get(uuid);
  store.delete(uuid);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.dataUrl;
}
