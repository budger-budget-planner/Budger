/// <reference lib="webworker" />
import { PrecacheEntry, precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[];
};

// Background Sync API is not yet in the standard TS lib — declare it here.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

// ── App-shell precaching (URLs injected at build time) ─────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Activate immediately on install — don't wait for old tabs to close.
// This is critical in dev: without skipWaiting the SW serves stale JS
// until the user manually closes every tab running the old version.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Take control of all open clients immediately after activation.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle explicit SKIP_WAITING message sent by the registration code
// (vite-plugin-pwa calls this when registerType === 'autoUpdate').
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── API caching: NetworkFirst ──────────────────────────────────────────────
// Tries the network first (5 s timeout), falls back to the last cached
// response when offline.  Only caches GET requests.
//
// /api/csrf-token is deliberately EXCLUDED (see below): it hands out a
// per-session security token, and NetworkFirst's cache fallback on a slow
// or flaky connection would serve a stale token that no longer matches the
// server's live session — every subsequent mutation then fails with
// "Invalid or missing CSRF token" until the cache is cleared.
registerRoute(
  ({ request }) =>
    request.method === "GET" &&
    request.url.includes("/api/") &&
    !request.url.includes("/api/csrf-token"),
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

// ── Background Sync: replay offline mutation queue ─────────────────────────
// Triggered by requestBackgroundSync() in the app when an op is enqueued.
// The OS fires the sync event when connectivity returns, even if the app is
// in the background or was closed.
//
// Replay logic mirrors mutation-queue.ts replayQueue():
// · 404 on DELETE → treated as success.
// · 4xx           → terminal failure; mark op "failed", stop replay.
// · 5xx / network → transient; keep op "pending", stop replay.
// · Web Locks are used to prevent concurrent drains with the page.

const SW_DB_NAME   = "budger-offline";
const SW_STORE     = "mutation_queue";
const SW_DB_VER    = 1;
const SW_LOCK_NAME = "budger-mutation-queue-replay";

interface SwQueuedOp {
  id: string;
  endpoint: string;
  method: string;
  payload: unknown;
  timestamp: number;
  status: string;
}

function openSwDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, SW_DB_VER);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SW_STORE)) {
        db.createObjectStore(SW_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

function swDequeue(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(SW_STORE, "readwrite").objectStore(SW_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function swMarkFailed(db: IDBDatabase, id: string, error: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s   = db.transaction(SW_STORE, "readwrite").objectStore(SW_STORE);
    const get = s.get(id);
    get.onsuccess = () => {
      const entry = { ...get.result, status: "failed", error };
      const put   = s.put(entry);
      put.onsuccess = () => resolve();
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

async function swReplayQueueInner(db: IDBDatabase): Promise<void> {
  const pending: SwQueuedOp[] = await new Promise((resolve, reject) => {
    const req = db.transaction(SW_STORE, "readonly").objectStore(SW_STORE).getAll();
    req.onsuccess = () => {
      const all = req.result as SwQueuedOp[];
      resolve(
        all
          .filter((o) => o.status === "pending")
          .sort((a, b) => a.timestamp - b.timestamp),
      );
    };
    req.onerror = () => reject(req.error);
  });

  for (const op of pending) {
    let fetchError: string | null = null;
    let isTerminal                = false;

    try {
      const hasBody =
        op.method !== "GET" && op.method !== "DELETE" && op.payload != null;

      const resp = await fetch(op.endpoint, {
        method: op.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Timestamp": String(op.timestamp),
        },
        ...(hasBody ? { body: JSON.stringify(op.payload) } : {}),
      });

      const ok = resp.ok || (resp.status === 404 && op.method === "DELETE");

      if (ok) {
        await swDequeue(db, op.id);
        continue; // next op
      }

      const text = await resp.text().catch(() => `HTTP ${resp.status}`);
      fetchError = text;
      isTerminal = resp.status >= 400 && resp.status < 500;
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
      isTerminal = false;
    }

    if (isTerminal && fetchError) {
      await swMarkFailed(db, op.id, fetchError);
    }
    // Stop replay to preserve FIFO ordering regardless of error type.
    break;
  }
}

async function swReplayQueue(): Promise<void> {
  const db = await openSwDB();

  if ("locks" in self) {
    await (self as typeof self & {
      locks: { request(name: string, opts: { mode: string }, fn: () => Promise<void>): Promise<void> };
    }).locks.request(SW_LOCK_NAME, { mode: "exclusive" }, () =>
      swReplayQueueInner(db),
    );
  } else {
    await swReplayQueueInner(db);
  }
}

self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag !== "budger-mutation-queue") return;
  syncEvent.waitUntil(swReplayQueue());
});
