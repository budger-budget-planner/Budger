import { WifiOff, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useState, useEffect, useRef } from "react";
import { t } from "@/lib/i18n";

/**
 * Thin banner that slides in just below the app header when offline.
 * When connectivity returns it briefly turns green ("Back online") then vanishes.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const prevRef  = useRef(isOnline);
  // "back-online" phase: show green banner for 2 s after coming back online
  const [backOnline, setBackOnline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const was = prevRef.current;
    prevRef.current = isOnline;
    if (!was && isOnline) {
      // just came back online
      setBackOnline(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setBackOnline(false), 2_000);
    }
    return () => clearTimeout(timerRef.current);
  }, [isOnline]);

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
            <div className="flex items-center justify-center gap-2 bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300 font-medium">
                {t("offline.back_online")}
              </p>
            </div>
          ) : (
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
