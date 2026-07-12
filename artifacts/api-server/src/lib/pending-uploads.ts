/**
 * Temp-file store for receipt uploads in transit.
 *
 * The old client flow is:
 *   1. POST /storage/uploads/request-url  → gets { uploadURL, objectPath }
 *   2. PUT  uploadURL                     → sends raw file bytes
 *   3. POST /transactions/:id/receipt     → sends { imageData: objectPath }
 *
 * Rather than keeping potentially large base64 strings in the Node.js heap
 * we write each upload to an OS temp file keyed by UUID and read it back on
 * first access.  Entries expire after 10 minutes; a periodic sweep removes
 * stale files so the tmp directory does not grow unboundedly.
 *
 * Only image MIME types are accepted — content is validated at write time
 * so a non-image payload is rejected before it ever touches the file system.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TTL_MS = 10 * 60 * 1000;
const TMP_DIR = os.tmpdir();
const PREFIX = "budger-upload-";

/** MIME types we accept for receipt images. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function uploadPath(uuid: string): string {
  // Sanitise: uuid must be alphanumeric + hyphens only to prevent path traversal.
  if (!/^[a-f0-9-]{36}$/i.test(uuid)) throw new Error("Invalid UUID");
  return path.join(TMP_DIR, `${PREFIX}${uuid}`);
}

function metaPath(uuid: string): string {
  return uploadPath(uuid) + ".meta";
}

interface Meta {
  expiresAt: number;
}

/** Remove all expired temp upload files. */
function sweep(): void {
  try {
    const now = Date.now();
    const files = fs.readdirSync(TMP_DIR);
    for (const f of files) {
      if (!f.startsWith(PREFIX) || !f.endsWith(".meta")) continue;
      const fullMeta = path.join(TMP_DIR, f);
      try {
        const meta: Meta = JSON.parse(fs.readFileSync(fullMeta, "utf8"));
        if (meta.expiresAt < now) {
          const base = fullMeta.slice(0, -5); // strip ".meta"
          fs.rmSync(base, { force: true });
          fs.rmSync(fullMeta, { force: true });
        }
      } catch { /* malformed meta — remove both files */ 
        fs.rmSync(fullMeta, { force: true });
      }
    }
  } catch { /* non-fatal */ }
}

/**
 * Persist a base64 data URL to a temp file.
 * Throws if the MIME type is not an allowed image type.
 */
export function setPendingUpload(uuid: string, dataUrl: string): void {
  // Validate MIME type from the data URL prefix: "data:<mime>;base64,..."
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  const mime = mimeMatch?.[1]?.toLowerCase() ?? "";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw Object.assign(new Error(`Unsupported file type: ${mime || "unknown"}`), { statusCode: 415 });
  }

  sweep();
  const meta: Meta = { expiresAt: Date.now() + TTL_MS };
  fs.writeFileSync(uploadPath(uuid), dataUrl, "utf8");
  fs.writeFileSync(metaPath(uuid), JSON.stringify(meta), "utf8");
}

/** Returns the data URL and removes the temp files (one-time use). */
export function popPendingUpload(uuid: string): string | null {
  const filePath = uploadPath(uuid);
  const mPath = metaPath(uuid);
  try {
    const meta: Meta = JSON.parse(fs.readFileSync(mPath, "utf8"));
    if (meta.expiresAt < Date.now()) {
      fs.rmSync(filePath, { force: true });
      fs.rmSync(mPath, { force: true });
      return null;
    }
    const dataUrl = fs.readFileSync(filePath, "utf8");
    fs.rmSync(filePath, { force: true });
    fs.rmSync(mPath, { force: true });
    return dataUrl;
  } catch {
    return null;
  }
}
