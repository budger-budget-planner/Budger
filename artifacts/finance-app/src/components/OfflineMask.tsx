import { useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { t } from "@/lib/i18n";

/**
 * Full-screen overlay shown on non-Home tabs when the app is offline.
 *
 * Z-index layering:
 *   page content  — z-auto (no explicit z-index)
 *   this mask     — z-[35]   ← above content, blocks interaction
 *   header / nav  — z-40     ← both remain visible and usable
 *   sheets        — z-50     ← profile / currency sheets still above
 *
 * The mask is NOT dismissable. Users must navigate to the Home tab.
 */
export function OfflineMask() {
  const isOnline = useOnlineStatus();
  const maskRef  = useRef<HTMLDivElement>(null);

  // Prevent underlying scroll via non-passive wheel + touchmove listeners.
  // React's synthetic events are passive by default so we must use imperative
  // addEventListener with { passive: false } here.
  useEffect(() => {
    if (isOnline) return;

    const stopScroll = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false, capture: true };

    document.addEventListener("wheel",      stopScroll, opts);
    document.addEventListener("touchmove",  stopScroll, opts);

    return () => {
      document.removeEventListener("wheel",     stopScroll, opts);
      document.removeEventListener("touchmove", stopScroll, opts);
    };
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <div
      ref={maskRef}
      className="fixed inset-0 z-[35] flex flex-col items-center justify-center select-none"
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      {/* dim + blur backdrop — lets users see the content below, dimmed */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[3px]" />

      {/* centred message card */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
          <WifiOff className="w-7 h-7 text-white/70" strokeWidth={1.75} />
        </div>

        <div className="space-y-1.5">
          <p className="text-white font-semibold text-lg leading-tight">
            {t("offline.mask_title")}
          </p>
          <p className="text-white/55 text-sm leading-snug max-w-[220px]">
            {t("offline.mask_subtitle")}
          </p>
        </div>
      </div>
    </div>
  );
}
