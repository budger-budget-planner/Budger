// Budger Service Worker — Web Push handler

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Budger", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Budger";
  const options = {
    body: data.body || "Time to log your spending.",
    icon: data.icon || "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || "budger-reminder",
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || "/?sheet=alerts",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetPath = new URL(targetUrl, self.location.origin).pathname;
        if (clientUrl.pathname === targetPath && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
