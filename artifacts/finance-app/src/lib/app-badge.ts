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
    // silent no-op on unsupported platforms
  }
}
