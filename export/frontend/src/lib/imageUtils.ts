/**
 * Converts a stored receiptImage value to a displayable URL.
 * New uploads store a permanent Supabase Storage public URL (https://...);
 * legacy rows may still hold a base64 data URL — both are supported
 * transparently until migrated.
 */
export function receiptSrc(receiptImage: string | null | undefined): string | null {
  if (!receiptImage) return null;
  if (receiptImage.startsWith("data:")) return receiptImage;          // legacy base64
  if (receiptImage.startsWith("http")) return receiptImage;           // Supabase public URL
  return `/api/storage${receiptImage}`;                                // legacy: /objects/uploads/uuid
}

/**
 * Request camera permission via getUserMedia so iOS shows the native
 * system prompt ("App would like to access your Camera").
 * Stops the stream immediately — we only need the permission grant.
 * Returns "granted", "denied", or "unavailable" (API not supported).
 */
export async function requestCameraPermission(): Promise<"granted" | "denied" | "unavailable"> {
  if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return "granted";
  } catch {
    return "denied";
  }
}

/**
 * Compress an image File to a JPEG data URL.
 * Resizes to maxPx on the longest edge, then encodes at `quality` (0-1).
 * Camera photos can be 5-12 MB; this brings them under ~200 KB.
 */
export async function compressImage(
  file: File,
  maxPx = 1200,
  quality = 0.78,
  timeoutMs = 15000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      callback();
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Image conversion timed out")));
    }, timeoutMs);

    img.onload = () => {
      try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) throw new Error("Image has no readable dimensions");

        const scale = Math.min(maxPx / width, maxPx / height, 1);
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        finish(() => resolve(dataUrl));
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error("Image conversion failed")));
      }
    };

    img.onerror = () => finish(() => reject(new Error("Image load failed")));
    img.src = url;
  });
}

/**
 * Read the original file when Safari cannot decode it for canvas conversion.
 * iPhones commonly return HEIC/HEIF files; the API accepts those formats and
 * can store them without requiring the browser to render them first.
 */
export async function readImageFile(
  file: File,
  timeoutMs = 20000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reader.abort();
      reject(new Error("Image read timed out"));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:")) {
        finish(() => reject(new Error("Image read failed")));
        return;
      }

      // Some iOS versions omit the HEIC MIME type on the File object and
      // FileReader then reports application/octet-stream. Preserve the real
      // image type so the backend can validate and store the upload.
      const extension = file.name.split(".").pop()?.toLowerCase();
      const fallbackType = extension === "heif" ? "image/heif"
        : extension === "heic" ? "image/heic"
        : file.type.startsWith("image/") ? file.type
        : null;
      const normalized = fallbackType && /^data:application\/octet-stream;/i.test(result)
        ? result.replace(/^data:application\/octet-stream;/i, `data:${fallbackType};`)
        : result;
      finish(() => resolve(normalized));
    };
    reader.onerror = () => finish(() => reject(new Error("Image read failed")));
    reader.onabort = () => finish(() => reject(new Error("Image read cancelled")));
    reader.readAsDataURL(file);
  });
}
