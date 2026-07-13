import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { countPending, replayQueue, withReplayLock, discardOp, opLabel, type QueuedOp } from "@/lib/mutation-queue";
import { toast } from "sonner";

/**
 * Mounts once (in Layout) and listens for the browser coming back online.
 * When it does, it drains the offline mutation queue in order, then
 * broadly invalidates all cached queries so the UI shows fresh data.
 */
export function useQueueReplay() {
  const queryClient = useQueryClient();
  const replayingRef    = useRef(false);
  // If a drain event arrives while a replay is already running we can't just
  // drop it — the newly-enqueued ops won't be in the snapshot that started.
  // Set a flag and run one more pass once the current drain finishes.
  const drainPendingRef = useRef(false);

  useEffect(() => {
    async function drain() {
      if (replayingRef.current) {
        drainPendingRef.current = true;
        return;
      }
      const count = await countPending().catch(() => 0);
      if (count === 0) return;

      replayingRef.current    = true;
      drainPendingRef.current = false;
      const toastId = toast.loading(
        `Syncing ${count} offline action${count !== 1 ? "s" : ""}…`,
      );

      try {
        const { succeeded, failed } = await withReplayLock(() =>
          replayQueue(
            undefined,
            // onFail — called once per terminal (4xx) op; shows a Discard toast
            (op: QueuedOp, error: string) => {
              toast.error(`Couldn't sync: ${opLabel(op)}`, {
                description: error.slice(0, 120),
                action: {
                  label: "Discard",
                  onClick: async () => {
                    await discardOp(op.id);
                    // Fire queue-drain so useQueueReplay retries remaining ops
                    window.dispatchEvent(new CustomEvent("queue-drain"));
                    window.dispatchEvent(new CustomEvent("queue-updated"));
                  },
                },
                duration: 10_000,
              });
            },
          ),
        );

        if (succeeded > 0) {
          // Broad invalidation — simpler than tracking which endpoints were touched.
          await queryClient.invalidateQueries();
        }

        if (failed > 0) {
          toast.error(
            `${failed} action${failed !== 1 ? "s" : ""} failed to sync`,
            {
              id: toastId,
              description:
                "Some changes may not have saved. Try repeating them.",
              duration: 6000,
            },
          );
        } else if (succeeded > 0) {
          toast.success(
            `Synced ${succeeded} offline action${succeeded !== 1 ? "s" : ""}`,
            { id: toastId, duration: 3000 },
          );
        } else {
          toast.dismiss(toastId);
        }
      } catch {
        toast.error("Sync failed — will retry on next reconnect", {
          id: toastId,
        });
      } finally {
        replayingRef.current = false;
        // A drain event arrived while we were running — process those ops now.
        if (drainPendingRef.current) {
          drainPendingRef.current = false;
          void drain();
        }
      }
    }

    // Attempt an immediate drain in case the app was opened while offline
    // and connectivity is now available.
    if (navigator.onLine) void drain();

    window.addEventListener("online",      drain);
    window.addEventListener("queue-drain", drain);
    return () => {
      window.removeEventListener("online",      drain);
      window.removeEventListener("queue-drain", drain);
    };
  }, [queryClient]);
}
