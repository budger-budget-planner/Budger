/**
 * Cross-platform notification helper.
 *
 * On iOS (Safari PWA), `new Notification()` constructor is not supported —
 * notifications MUST go through `ServiceWorkerRegistration.showNotification()`.
 * This helper always tries the service worker first, falls back to the
 * constructor only on platforms that support it (desktop Chrome/Firefox).
 */
export async function showNotification(
  title: string,
  options: NotificationOptions & { url?: string } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const { url, ...notifOptions } = options;
  const swOptions: NotificationOptions & { data?: { url?: string } } = {
    ...notifOptions,
    icon: notifOptions.icon ?? "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: url ?? "/" },
  };

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, swOptions);
      return;
    } catch {
      // fall through
    }
  }

  try {
    new Notification(title, swOptions);
  } catch {
    // ignore
  }
}
