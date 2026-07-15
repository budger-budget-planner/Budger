// Badging API helper — puts a red count badge on the app's home-screen icon
// (iOS 16.4+ / Android / desktop, only when installed as a standalone PWA).
// Feature-detected everywhere so it's a silent no-op on unsupported browsers
// or when the app is just an open browser tab (not installed).

export function isBadgingSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (!isBadgingSupported()) return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Some platforms advertise the API but throw (e.g. not installed) — ignore.
  }
}
