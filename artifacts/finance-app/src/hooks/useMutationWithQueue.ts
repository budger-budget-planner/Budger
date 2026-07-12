import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue, requestBackgroundSync } from "@/lib/mutation-queue";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type QueryClient = ReturnType<typeof useQueryClient>;

export interface MutationWithQueueOptions<TVars> {
  /** Absolute URL or function that derives the URL from vars. */
  endpoint: string | ((vars: TVars) => string);
  /** HTTP method. Default: "POST". */
  method?: string;
  /**
   * Extract the request body from vars.
   * If omitted: vars itself is used as the body (except DELETE/GET which never have a body).
   */
  getPayload?: (vars: TVars) => unknown;
  /**
   * Apply an optimistic cache update when queuing offline.
   * Called synchronously so the UI reflects the change immediately.
   */
  optimisticUpdate?: (vars: TVars, queryClient: QueryClient) => void;
  /**
   * Called after a successful online request.
   * Receives the parsed JSON response (or undefined for 204 / empty bodies).
   */
  onSuccess?: (data: unknown, vars: TVars) => void | Promise<void>;
  /** Called on a failed online request. Overrides the default error toast. */
  onError?: (error: Error, vars: TVars) => void;
}

/** Per-call overrides passed as the second argument to `mutate(vars, overrides)`. */
export interface MutateOverrides<TVars> {
  onSuccess?: (data: unknown, vars: TVars) => void | Promise<void>;
  onError?: (error: Error, vars: TVars) => void;
}

export interface MutationWithQueueResult<TVars> {
  /**
   * Fire the mutation.
   * - Online  → executes the request immediately; calls `onSuccess` / `onError`.
   * - Offline → enqueues; calls opts.`onSuccess` with `undefined` data so the
   *             UI can still close dialogs and update state. Per-call
   *             `overrides.onSuccess` is skipped (requires server response).
   */
  mutate: (vars: TVars, overrides?: MutateOverrides<TVars>) => void;
  isPending: boolean;
  /** True after the last call was queued because the device was offline. */
  wasQueued: boolean;
}

/**
 * Drop-in replacement for Orval / TanStack mutation hooks with offline
 * queuing support.
 *
 * - **Online**  → fires a `fetch` immediately, parses JSON, calls `onSuccess`.
 * - **Offline** → enqueues the op in IndexedDB, triggers Background Sync,
 *                 applies an optional optimistic cache update, shows a toast.
 *
 * On reconnect, `useQueueReplay` (mounted in Layout) drains the queue.
 */
export function useMutationWithQueue<TVars>(
  opts: MutationWithQueueOptions<TVars>,
): MutationWithQueueResult<TVars> {
  const queryClient = useQueryClient();
  const isOnline    = useOnlineStatus();
  const [isPending, setIsPending] = useState(false);
  const [wasQueued, setWasQueued] = useState(false);

  // Keep opts + online state in refs so `mutate` never goes stale.
  const optsRef     = useRef(opts);
  optsRef.current   = opts;
  const onlineRef   = useRef(isOnline);
  onlineRef.current = isOnline;

  const mutate = useCallback(
    (vars: TVars, overrides?: MutateOverrides<TVars>) => {
      const o      = optsRef.current;
      const online = onlineRef.current;
      const method = (o.method ?? "POST").toUpperCase();
      const ep     = typeof o.endpoint === "function" ? o.endpoint(vars) : o.endpoint;

      // Only POST / PATCH / PUT carry a body.
      const hasBody = method !== "GET" && method !== "DELETE";
      const payload = hasBody
        ? (o.getPayload ? o.getPayload(vars) : vars)
        : undefined;

      // ── Offline path ────────────────────────────────────────────────────
      if (!online) {
        // Run async work in a fire-and-forget but surface enqueue failures.
        void (async () => {
          try {
            await enqueue({ endpoint: ep, method, payload });
            await requestBackgroundSync();
          } catch (e) {
            toast.error("Failed to save offline. Please try again.");
            console.error("[MutationQueue] enqueue failed:", e);
            return; // Don't show success UX if enqueue failed.
          }
          o.optimisticUpdate?.(vars, queryClient);
          setWasQueued(true);
          toast("Saved offline", {
            description: "Will sync automatically when back online.",
            duration: 3000,
          });
          // Call opts.onSuccess so the UI can still close dialogs / update state.
          // Per-call overrides.onSuccess is intentionally skipped — it may depend
          // on server-returned data (e.g. a new resource id).
          void o.onSuccess?.(undefined, vars);
        })();
        return;
      }

      // ── Online path ─────────────────────────────────────────────────────
      setIsPending(true);
      setWasQueued(false);

      // apiFetch attaches the x-csrf-token header (required by the server's
      // CSRF middleware for POST/PUT/PATCH/DELETE) and transparently retries
      // once on a stale-token 403 — plain fetch() here would send no token
      // at all and every mutation would be rejected.
      apiFetch(ep, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Client-Timestamp": String(Date.now()),
        },
        ...(hasBody && payload != null ? { body: JSON.stringify(payload) } : {}),
      })
        .then(async (resp) => {
          if (!resp.ok) {
            const text = await resp.text().catch(() => `HTTP ${resp.status}`);
            throw new Error(text);
          }
          // Parse JSON when available; fall back to undefined for 204 / empty.
          let data: unknown;
          const ct = resp.headers.get("content-type") ?? "";
          if (resp.status !== 204 && ct.includes("application/json")) {
            data = await resp.json().catch(() => undefined);
          }

          // Call opts-level onSuccess first, then per-call override.
          await o.onSuccess?.(data, vars);
          await overrides?.onSuccess?.(data, vars);
        })
        .catch((e: unknown) => {
          const err = e instanceof Error ? e : new Error(String(e));
          const handler = overrides?.onError ?? o.onError;
          if (handler) {
            handler(err, vars);
          } else {
            toast.error(err.message || "Request failed");
          }
        })
        .finally(() => setIsPending(false));
    },
    // queryClient is stable; all other values are read through refs.
    [queryClient],
  );

  return { mutate, isPending, wasQueued };
}
