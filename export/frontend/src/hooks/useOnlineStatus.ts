import { useEffect, useState } from "react";

const FORCE_OFFLINE_KEY = "budger_force_offline";

/**
 * Returns true when the app should be treated as online.
 *
 * Respects the `budger_force_offline` localStorage key written by the NC
 * Settings toggle.  When that key is "1":
 *   - Real `online` browser events are suppressed (isOnline stays false).
 *   - A custom `budger-connection-detected` event is dispatched instead so
 *     Layout can surface the "Connection available — go back online?" prompt.
 * A periodic check fires every 15 s to catch the case where force-offline
 * was enabled while the device was already connected (no real `online` event
 * will ever fire in that scenario).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => {
    try {
      if (localStorage.getItem(FORCE_OFFLINE_KEY) === "1") return false;
    } catch { /**/ }
    return navigator.onLine;
  });

  useEffect(() => {
    function notifyConnectionDetected() {
      window.dispatchEvent(new CustomEvent("budger-connection-detected"));
    }

    const goOnline = () => {
      try {
        if (localStorage.getItem(FORCE_OFFLINE_KEY) === "1") {
          notifyConnectionDetected();
          return; // respect the user's manual offline choice
        }
      } catch { /**/ }
      setIsOnline(true);
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // Periodic check: when force-offline is active and the device was never
    // actually offline, no real `online` event fires — we must poll.
    const interval = setInterval(() => {
      try {
        if (localStorage.getItem(FORCE_OFFLINE_KEY) === "1" && navigator.onLine) {
          notifyConnectionDetected();
        }
      } catch { /**/ }
    }, 15_000);

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
