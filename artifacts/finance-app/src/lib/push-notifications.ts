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
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return false;

    const reg = await registerServiceWorker();
    if (!reg) return false;

    await navigator.serviceWorker.ready;

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
