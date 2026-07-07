import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Thin banner that slides in just below the app header whenever the device
 * loses network connectivity. Disappears automatically when back online.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300 font-medium">
              You're offline — viewing saved data
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
