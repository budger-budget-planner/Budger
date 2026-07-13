import { WifiOff } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Full-screen overlay shown on non-Home tabs when the app is offline.
 *
 * Rendered by Layout.tsx (not individual pages) so it automatically covers
 * every non-Home route without each page having to opt in.
 *
 * Z-index layering:
 *   page content  — z-auto (no explicit z-index)
 *   this mask     — z-[35]   ← above content, blocks interaction
 *   header / nav  — z-40     ← both remain visible and usable so the user
 *                              can tap Home to dismiss the blocked state
 *   sheets        — z-50     ← profile / currency sheets still above
 *
 * The mask is NOT dismissable — the user must navigate to the Home tab.
 */
export function OfflineMask() {
  return (
    <div
      className="fixed inset-0 z-[35] flex flex-col items-center justify-center select-none"
      /* Prevent any pointer/touch event from reaching the page beneath */
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {/* Dimmed see-through backdrop — intentionally translucent so the user
          can see the page content underneath (confirming they are offline) */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      {/* Centred amber notice */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-10 text-center">
        {/* Icon container — amber tint */}
        <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30
                        flex items-center justify-center">
          <WifiOff className="w-6 h-6 text-amber-400" strokeWidth={1.75} />
        </div>

        <div className="space-y-1.5">
          {/* Primary label — amber, prominent */}
          <p className="text-amber-400 font-semibold text-base leading-tight tracking-tight">
            {t("offline.mask_title")}
          </p>
          {/* Supporting hint — slightly muted amber */}
          <p className="text-amber-300/70 text-sm leading-snug max-w-[220px]">
            {t("offline.mask_subtitle")}
          </p>
        </div>
      </div>
    </div>
  );
}
