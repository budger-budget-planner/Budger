/// <reference lib="webworker" />
import { PrecacheEntry, precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[];
};

// ── App-shell precaching (URLs injected at build time) ─────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── API caching: NetworkFirst ──────────────────────────────────────────────
// Tries the network first (5 s timeout), falls back to the last cached
// response when offline.  Only caches GET requests.
registerRoute(
  ({ request }) =>
    request.method === "GET" && request.url.includes("/api/"),
  new NetworkFirst({
    cacheName: "budger-api-v1",
    networkTimeoutSeconds: 5,
  })
);

// ── Push notifications ─────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data: Record<string, string> = {};
  try {
    data = event.data ? (event.data.json() as Record<string, string>) : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  // Derive base-aware URLs from the SW's own scope so the app works
  // correctly under any BASE_PATH (e.g. /finance-app/).
  const scope = self.registration.scope; // e.g. "https://host/finance-app/"
  const iconUrl   = data.icon  || new URL("favicon.svg", scope).href;
  const targetUrl = data.url   || new URL("?sheet=alerts", scope).href;

  const title = data.title || "Budger";
  // `renotify` is a valid Notification API option but missing from TS lib types.
  const options = {
    body: data.body || "Time to log your spending.",
    icon: iconUrl,
    badge: new URL("favicon.svg", scope).href,
    tag: data.tag || "budger-reminder",
    renotify: true,
    requireInteraction: false,
    data: { url: targetUrl },
  } satisfies Record<string, unknown>;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data as { url?: string } | null;
  // Fall back to the SW scope root so clicks always land inside the app.
  const targetUrl = notifData?.url ?? self.registration.scope;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const targetPath = new URL(targetUrl, self.location.origin).pathname;
          if (clientUrl.pathname === targetPath && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
