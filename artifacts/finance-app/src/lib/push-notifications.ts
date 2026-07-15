// Web Push notification utilities

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("SW registration failed:", err);
    return null;
  }
}

export async function getOrCreatePushSubscription(
  vapidPublicKey: string,
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  } catch (err) {
    console.warn("Push subscription failed:", err);
    return null;
  }
}

export async function savePushSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const key = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!key || !auth) return;

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
  const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)));

  await fetch("/api/notifications/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth: authStr }),
  });
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  try {
    const vapidRes = await fetch("/api/notifications/vapid-public-key", { credentials: "include" });
    if (!vapidRes.ok) return false;
    const { publicKey } = await vapidRes.json() as { publicKey?: string };
    if (!publicKey) return false;

    // vite-plugin-pwa handles registration; wait for the SW to be ready,
    // but give up after 10 s to avoid a silent hang on slow devices.
    if (!("serviceWorker" in navigator)) return false;
    const readyTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SW ready timeout")), 10_000)
    );
    const reg = await Promise.race([navigator.serviceWorker.ready, readyTimeout]);

    const sub = await getOrCreatePushSubscription(publicKey, reg);
    if (!sub) return false;

    await savePushSubscriptionToServer(sub);
    return true;
  } catch {
    return false;
  }
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Tears down push delivery for this device: unsubscribes the browser-side
// PushManager subscription (so the OS/browser stops routing pushes to it)
// and tells the server to forget the matching endpoint so it stops sending.
// Browser permission itself can't be revoked from JS — this is the only
// real "off" switch available to an in-app toggle.
export async function unsubscribeFromPushNotifications(): Promise<void> {
  let endpoint: string | undefined;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
      }
    }
  } catch {
    /* best-effort browser-side unsubscribe */
  }

  try {
    await fetch("/api/notifications/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best-effort server-side cleanup */
  }
}
