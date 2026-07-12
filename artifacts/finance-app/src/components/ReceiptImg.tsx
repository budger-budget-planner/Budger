import { useState, useEffect } from "react";

/**
 * Renders a receipt image, converting base64 data URLs to blob URLs first.
 * iOS Safari has an undocumented size limit on inline `data:` URLs used as
 * an <img> src — past a few hundred KB the image silently fails to render.
 * Converting to a blob URL sidesteps that limit entirely. Object-storage
 * paths (already a normal URL) are used as-is.
 *
 * Shared by every receipt-photo surface in the app — do not duplicate this
 * logic locally; a second implementation is how the "Camera/Library
 * buttons" and "photo not visible until reopened" bugs came back.
 */
export function ReceiptImg({
  src,
  className,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  // Start null so we never flash a raw data URL (which breaks on iOS Safari).
  const [blobSrc, setBlobSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) { setBlobSrc(null); return; }

    if (!src.startsWith("data:")) {
      // Regular URL (object-storage path) — use as-is.
      setBlobSrc(src);
      return;
    }

    // Convert data URL → blob URL to bypass iOS Safari's inline data URL limit.
    let revoked = false;
    let objectUrl: string | null = null;
    try {
      const commaIdx = src.indexOf(",");
      if (commaIdx === -1) { setBlobSrc(src); return; }
      const mime = (src.slice(5, commaIdx).match(/^([^;]+)/) ?? [])[1] ?? "image/jpeg";
      const bytes = Uint8Array.from(atob(src.slice(commaIdx + 1)), c => c.charCodeAt(0));
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      if (!revoked) setBlobSrc(objectUrl);
    } catch {
      setBlobSrc(src); // fallback: try the data URL directly
    }
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!blobSrc) {
    // Show a neutral skeleton while the blob URL is being prepared.
    return <div className={`animate-pulse bg-muted rounded-xl ${className ?? ""}`} style={{ minHeight: 160 }} />;
  }

  return <img src={blobSrc} className={className} {...props} />;
}
