import { useState, useEffect, useCallback } from "react";
import { listAll, type QueuedOp } from "@/lib/mutation-queue";

/** A transaction reconstructed from a queued POST that hasn't reached the DB yet. */
export interface PendingTransaction {
  /** Temporary client-only id (negative integer so it never collides with DB ids). */
  id: string;
  /** The IndexedDB queue entry id — used to map this item back to the op. */
  queueId: string;
  amount: number;
  description: string;
  categoryId: number | null;
  date: string;
  paymentMethod: string;
  /** Always true — used by the UI to render a greyed-out "pending" style. */
  _pending: true;
}

export interface OfflinePendingOps {
  ops: QueuedOp[];
  pendingCount: number;
  failedCount: number;
  /** IDs of transactions that have a PATCH or DELETE queued. */
  pendingTxIds: Set<number>;
  /** IDs of goals that have a pending contribution (POST /api/goal-contributions). */
  pendingGoalIds: Set<number>;
  /**
   * Transactions that were created while offline and are still waiting to sync.
   * Show these in the UI immediately (greyed out) so the user sees their input.
   */
  pendingTransactions: PendingTransaction[];
  refresh: () => void;
}

/**
 * Polls the IndexedDB mutation queue and returns the current set of ops.
 *
 * Automatically refreshes when:
 * - A new op is enqueued    ("queue-updated" custom event)
 * - Connectivity returns    ("online" event)
 * - A drain is requested    ("queue-drain" custom event)
 * - On a 4-second heartbeat (catches cross-context writes from the SW)
 */
export function useOfflinePendingOps(): OfflinePendingOps {
  const [ops, setOps] = useState<QueuedOp[]>([]);

  const refresh = useCallback(() => {
    listAll()
      .then(setOps)
      .catch(() => {}); // silently ignore IDB errors
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    window.addEventListener("queue-updated", refresh);
    window.addEventListener("queue-drain",   refresh);
    window.addEventListener("online",        refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("queue-updated", refresh);
      window.removeEventListener("queue-drain",   refresh);
      window.removeEventListener("online",        refresh);
    };
  }, [refresh]);

  // PATCH or DELETE on /api/transactions/:id → that tx has a pending write
  const pendingTxIds = new Set<number>(
    ops
      .filter((op) => {
        const api = op.endpoint.split("/api/")[1] ?? "";
        return (
          op.status === "pending" &&
          (op.method === "PATCH" || op.method === "DELETE") &&
          /^transactions\/\d+$/.test(api)
        );
      })
      .map((op) => {
        const m = op.endpoint.match(/\/transactions\/(\d+)$/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((id): id is number => id !== null),
  );

  // POST /api/goal-contributions → extract goalId from payload.
  // useMutationWithQueue passes `getPayload: vars => vars.data`, so the queued
  // payload is the unwrapped data object: { goalId, amount, ... }.
  // Guard against the nested shape too for forward compatibility.
  const pendingGoalIds = new Set<number>(
    ops
      .filter((op) => {
        const api = op.endpoint.split("/api/")[1] ?? "";
        return op.status === "pending" && op.method === "POST" && api === "goal-contributions";
      })
      .map((op) => {
        const p = op.payload as { goalId?: number; data?: { goalId?: number } } | null;
        return p?.goalId ?? p?.data?.goalId ?? null;
      })
      .filter((id): id is number => id !== null),
  );

  // POST /api/transactions → reconstruct as fake transaction objects for optimistic display.
  // The queued payload is the unwrapped data object: { amount, description, categoryId, date, paymentMethod }.
  const pendingTransactions: PendingTransaction[] = ops
    .filter((op) => {
      const api = op.endpoint.split("/api/")[1] ?? "";
      return op.status === "pending" && op.method === "POST" && api === "transactions";
    })
    .map((op) => {
      const p = op.payload as {
        amount?: number;
        description?: string;
        categoryId?: number | null;
        date?: string;
        paymentMethod?: string;
      } | null;
      return {
        id: `pending-${op.id}`,
        queueId: op.id,
        amount: Number(p?.amount ?? 0),
        description: p?.description ?? "",
        categoryId: p?.categoryId ?? null,
        date: p?.date ?? "",
        paymentMethod: p?.paymentMethod ?? "card",
        _pending: true as const,
      };
    });

  return {
    ops,
    pendingCount: ops.filter((o) => o.status === "pending").length,
    failedCount:  ops.filter((o) => o.status === "failed").length,
    pendingTxIds,
    pendingGoalIds,
    pendingTransactions,
    refresh,
  };
}
