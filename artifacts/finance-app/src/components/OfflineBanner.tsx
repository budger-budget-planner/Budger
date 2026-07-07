import { WifiOff, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useState, useEffect, useRef } from "react";
import { t } from "@/lib/i18n";

const FORCE_OFFLINE_KEY = "budger_force_offline";

/**
 * Thin banner that slides in just below the app header when offline.
 *
 * States:
 *  1. Offline (normal / device offline)   → amber "You're offline" stripe
 *  2. Force-offline + connection detected → amber stripe turns into a compact
 *     "Connection available — Stay / Go online" prompt
 *  3. Just came back online               → green "Back online" stripe for 2 s
 *  4. Online, settled                     → hidden
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const prevRef  = useRef(isOnline);

  // "back-online" phase: show green banner for 2 s after coming back online
  const [backOnline, setBackOnline]           = useState(false);
  const [connectionDetected, setDetected]     = useState(false);
  const dismissedRef                          = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Green confirmation on reconnect
  useEffect(() => {
    const was = prevRef.current;
    prevRef.current = isOnline;
    if (!was && isOnline) {
      setDetected(false);
      setBackOnline(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setBackOnline(false), 2_000);
    }
    if (isOnline) dismissedRef.current = false; // reset for next forced-offline session
    return () => clearTimeout(timerRef.current);
  }, [isOnline]);

  // Listen for "connection detected while force-offline" events
  useEffect(() => {
    function checkAndPrompt() {
      if (dismissedRef.current) return;
      try {
        if (localStorage.getItem(FORCE_OFFLINE_KEY) === "1" && navigator.onLine) {
          setDetected(true);
        }
      } catch { /* ignore */ }
    }

    // Check immediately on mount (catches the "just logged in while force-offline" case)
    checkAndPrompt();

    window.addEventListener("budger-connection-detected", checkAndPrompt);
    // If device actually goes offline, clear the prompt and reset dismissal
    const onOffline = () => {
      dismissedRef.current = false;
      setDetected(false);
    };
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("budger-connection-detected", checkAndPrompt);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  function handleGoOnline() {
    try { localStorage.removeItem(FORCE_OFFLINE_KEY); } catch { /* ignore */ }
    dismissedRef.current = false;
    setDetected(false);
    window.dispatchEvent(new Event("online"));
  }

  function handleStayOffline() {
    dismissedRef.current = true;
    setDetected(false);
  }

  const visible = !isOnline || backOnline;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          {backOnline ? (
            /* ── Green: back online ── */
            <div className="flex items-center justify-center gap-2 bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300 font-medium">
                {t("offline.back_online")}
              </p>
            </div>
          ) : connectionDetected ? (
            /* ── Amber: connection detected — ask user ── */
            <div className="flex items-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5">
              <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300 font-medium flex-1 leading-none">
                {t("offline.connection_detected")}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleStayOffline}
                  className="text-[11px] font-medium text-amber-400/80 px-2 py-1 rounded-md
                             border border-amber-500/30 bg-amber-500/10
                             transition active:opacity-60 leading-none"
                >
                  {t("offline.stay_offline")}
                </button>
                <button
                  onClick={handleGoOnline}
                  className="text-[11px] font-medium text-amber-900 px-2 py-1 rounded-md
                             bg-amber-400 transition active:opacity-70 leading-none"
                >
                  {t("offline.go_online")}
                </button>
              </div>
            </div>
          ) : (
            /* ── Amber: offline ── */
            <div className="flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2">
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300 font-medium">
                {t("offline.banner")}
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
