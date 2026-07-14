/**
 * Offline mutation queue backed by IndexedDB.
 *
 * Stores pending mutations when the device is offline and replays them
 * in insertion order once connectivity is restored.
 *
 * Design choices:
 * - Ops are replayed strictly in chronological order.
 * - Replay stops on the first failure to preserve ordering guarantees.
 *   · 4xx HTTP → terminal failure: op is marked "failed" and skipped on
 *     future replays.  Replay stops so dependent later ops aren't orphaned.
 *   · 5xx / network error → transient: op stays "pending" and will be
 *     retried on the next replay.  Replay stops.
 * - Web Locks API is used to prevent concurrent drains from the page and
 *   the SW Background Sync handler (exported as `withReplayLock`).
 */

import { t } from "./i18n";
import { getCsrfToken, resetCsrfToken } from "./api-client/custom-fetch";

const DB_NAME   = "budger-offline";
const STORE     = "mutation_queue";
const DB_VER    = 1;
const LOCK_NAME = "budger-mutation-queue-replay";

export interface QueuedOp {
  id: string;
  endpoint: string;
  method: string;
  /** Request body (for POST/PATCH/PUT). Undefined for DELETE/GET. */
  payload: unknown;
  timestamp: number;
  status: "pending" | "failed";
  error?: string;
}

// Singleton DB connection — reused across calls in the same page session.
let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror  = () => reject(req.error);
  });
}

function idbStore(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// ─── Write operations ────────────────────────────────────────────────────────

export async function enqueue(
  op: Omit<QueuedOp, "id" | "timestamp" | "status">
): Promise<string> {
  const db = await openDB();
  const id  = crypto.randomUUID();
  const entry: QueuedOp = { ...op, id, timestamp: Date.now(), status: "pending" };
  return new Promise((resolve, reject) => {
    const req = idbStore(db, "readwrite").add(entry);
    req.onsuccess = () => {
      resolve(id);
      // Notify any page-level listeners so they refresh the pending count.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("queue-updated"));
      }
    };
    req.onerror  = () => reject(req.error);
  });
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = idbStore(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s   = idbStore(db, "readwrite");
    const get = s.get(id);
    get.onsuccess = () => {
      const entry = get.result as QueuedOp | undefined;
      if (!entry) { resolve(); return; }
      entry.status = "failed";
      entry.error  = error;
      const put = s.put(entry);
      put.onsuccess = () => resolve();
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

// ─── Read operations ─────────────────────────────────────────────────────────

export async function listPending(): Promise<QueuedOp[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = idbStore(db, "readonly").getAll();
    req.onsuccess = () => {
      const all = req.result as QueuedOp[];
      resolve(
        all
          .filter((o) => o.status === "pending")
          .sort((a, b) => a.timestamp - b.timestamp),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPending(): Promise<number> {
  return (await listPending()).length;
}

// ─── Locking ─────────────────────────────────────────────────────────────────

/**
 * Acquire an exclusive Web Lock before running `fn`.
 * Prevents the page's online-event handler and the SW Background Sync from
 * draining the queue at the same time.
 * Falls back to an un-guarded call on browsers without Web Locks (rare).
 */
export function withReplayLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    // Cast through unknown to avoid TS's Promise<Promise<T>> inference issue
    // with the overloaded navigator.locks.request signature.
    return navigator.locks.request(
      LOCK_NAME,
      { mode: "exclusive" as LockMode },
      fn,
    ) as unknown as Promise<T>;
  }
  // Fallback: no lock — concurrent replay is unlikely but possible.
  return fn();
}

// ─── Replay ──────────────────────────────────────────────────────────────────

/**
 * Replay all pending ops in chronological order.
 *
 * Stops on the first failure to preserve ordering:
 * - 404 on DELETE   → treated as success (resource already removed).
 * - 4xx             → terminal: marks op "failed", stops loop.
 * - 5xx / network   → transient: leaves op "pending" for retry, stops loop.
 *
 * Always call this inside `withReplayLock` to avoid concurrent drains.
 */
export async function replayQueue(
  onSuccess?: (op: QueuedOp) => void,
  onFail?: (op: QueuedOp, error: string) => void,
): Promise<{ succeeded: number; failed: number }> {
  const pending = await listPending();
  let succeeded = 0;
  let failed    = 0;

  for (const op of pending) {
    let fetchError: string | null = null;
    let isTerminal = false;

    try {
      const hasBody =
        op.method !== "GET" && op.method !== "DELETE" && op.payload != null;

      const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
      const isMutating = CSRF_METHODS.has(op.method);
      const replayHeaders = new Headers({
        "Content-Type": "application/json",
        "X-Client-Timestamp": String(op.timestamp),
      });
      if (isMutating) {
        try {
          replayHeaders.set("x-csrf-token", await getCsrfToken());
        } catch {
          resetCsrfToken();
        }
      }

      let resp = await fetch(op.endpoint, {
        method: op.method,
        credentials: "include",
        headers: replayHeaders,
        ...(hasBody ? { body: JSON.stringify(op.payload) } : {}),
      });

      // Self-heal a stale/rotated CSRF token: retry once with a fresh one.
      if (isMutating && resp.status === 403) {
        resetCsrfToken();
        const retryHeaders = new Headers({
          "Content-Type": "application/json",
          "X-Client-Timestamp": String(op.timestamp),
        });
        try {
          retryHeaders.set("x-csrf-token", await getCsrfToken());
          resp = await fetch(op.endpoint, {
            method: op.method,
            credentials: "include",
            headers: retryHeaders,
            ...(hasBody ? { body: JSON.stringify(op.payload) } : {}),
          });
        } catch {
          // Retry setup failed — fall through and report the 403.
        }
      }

      const ok =
        resp.ok || (resp.status === 404 && op.method === "DELETE");

      if (ok) {
        await dequeue(op.id);
        succeeded++;
        onSuccess?.(op);
        continue; // process next op
      }

      const text = await resp.text().catch(() => `HTTP ${resp.status}`);
      fetchError = text;
      // 4xx → bad request from the client; mark failed and stop.
      // 5xx → server-side problem; keep pending and stop.
      isTerminal = resp.status >= 400 && resp.status < 500;
    } catch (e) {
      // Network/infrastructure error → keep pending, stop.
      fetchError  = e instanceof Error ? e.message : String(e);
      isTerminal  = false;
    }

    // We only reach here on a failure.
    if (isTerminal && fetchError) {
      await markFailed(op.id, fetchError);
      failed++;
      onFail?.(op, fetchError);
    }
    // Stop replay regardless — preserves FIFO ordering.
    break;
  }

  return { succeeded, failed };
}

// ─── Background Sync registration ────────────────────────────────────────────

// ─── Additional read / utility exports ───────────────────────────────────────

/**
 * Return ALL ops (both "pending" and "failed") sorted by timestamp.
 * Used by `useOfflinePendingOps` to populate the sync status UI.
 */
export async function listAll(): Promise<QueuedOp[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = idbStore(db, "readonly").getAll();
    req.onsuccess = () => {
      const all = req.result as QueuedOp[];
      resolve(all.sort((a, b) => a.timestamp - b.timestamp));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove any op from the queue regardless of its status (pending or failed).
 * Equivalent to `dequeue`; exported with a clearer name for the discard flow.
 */
export const discardOp = dequeue;

/**
 * Return a short, human-readable label for a queued op.
 * Matches against the /api/<path> suffix of the endpoint so it works
 * regardless of the BASE_URL prefix (e.g. `/finance-app/api/…`).
 */
export function opLabel(op: QueuedOp): string {
  const { method, endpoint } = op;
  const api = endpoint.split("/api/")[1] ?? endpoint;
  if (api === "transactions"                        && method === "POST")   return t("queue.add_transaction");
  if (/^transactions\/\d+$/.test(api)               && method === "PATCH")  return t("queue.edit_transaction");
  if (/^transactions\/\d+$/.test(api)               && method === "DELETE") return t("queue.delete_transaction");
  if (api === "auth/me"                             && method === "PATCH")  return t("queue.update_profile");
  if (api === "goal-contributions"                  && method === "POST")   return t("queue.goal_contribution");
  if (/^goal-contributions\/\d+$/.test(api)         && method === "DELETE") return t("queue.remove_contribution");
  if (api === "recurring-payments"                  && method === "POST")   return t("queue.add_recurring");
  if (/^recurring-payments\/\d+$/.test(api)         && method === "PATCH")  return t("queue.edit_recurring");
  if (/^recurring-payments\/\d+$/.test(api)         && method === "DELETE") return t("queue.delete_recurring");
  if (/^recurring-payments\/\d+\/apply$/.test(api)  && method === "POST")   return t("queue.apply_recurring");
  if (api === "larder/entries"                      && method === "POST")   return t("queue.fund_larder");
  if (/^larder\/entries\/\d+$/.test(api)            && method === "DELETE") return t("queue.remove_larder");
  if (api === "larder/spend"                        && method === "POST")   return t("queue.larder_withdrawal");
  if (api === "larder/dedicate-to-goal"             && method === "POST")   return t("queue.larder_to_goal");
  if (api === "great-larder/send"                   && method === "POST")   return t("queue.send_to_gl");
  return `${method} /${api}`;
}

/**
 * Ask the Service Worker to replay the queue via the Background Sync API.
 * Falls back silently if the API is unavailable (e.g. iOS Safari ≤ 16).
 */
export async function requestBackgroundSync(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if ("sync" in reg) {
      await (
        reg as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> };
        }
      ).sync.register("budger-mutation-queue");
    }
  } catch {
    // Background Sync unavailable — window "online" event is the fallback.
  }
}
