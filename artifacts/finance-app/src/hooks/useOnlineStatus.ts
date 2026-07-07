import { useEffect, useState } from "react";

const FORCE_OFFLINE_KEY = "budger_force_offline";

/**
 * Returns true when the browser believes it has network connectivity.
 * Updates reactively on `online` / `offline` window events.
 *
 * Can be overridden via the NC Settings "Go Offline" toggle, which writes
 * the `budger_force_offline` localStorage key and dispatches `offline` /
 * `online` window events so this hook reacts automatically.
 * Persists across page reloads via the localStorage key.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => {
    try {
      if (localStorage.getItem(FORCE_OFFLINE_KEY) === "1") return false;
    } catch { /**/ }
    return navigator.onLine;
  });

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
