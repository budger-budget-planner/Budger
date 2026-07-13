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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxPx / img.naturalWidth, maxPx / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
