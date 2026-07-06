import { useEffect, useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";

// Wink-only splash: plays a single wink animation then fades out.
// Used for transitions that don't warrant the full sniff→lick→wink sequence
// (e.g. language/currency switching, future in-app transitions).
const WINK_MS   = 700;
const SETTLE_MS = 300;  // brief pause after wink so it doesn't feel rushed
const FADE_MS   = 400;  // CSS fade-out duration

export default function WinkSplashScreen({ onDone }: { onDone?: () => void }) {
  const [animStep, setAnimStep] = useState<"wink" | "idle">("wink");
  const [fading,   setFading]   = useState(false);

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    // Wink finishes → idle
    ids.push(setTimeout(() => setAnimStep("idle"), WINK_MS));

    // Only auto-dismiss if a caller wants to know when it's done
    if (onDone) {
      // Start fade after wink + settle
      ids.push(setTimeout(() => setFading(true), WINK_MS + SETTLE_MS));
      // Notify caller after fade completes
      ids.push(setTimeout(onDone, WINK_MS + SETTLE_MS + FADE_MS));
    }

    return () => ids.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      className="splash-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background:
          "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: fading ? `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div className="splash-pulse">
        <BadgerLogo
          size={120}
          forceAnim={animStep === "wink" ? "wink" : null}
          forceAnimDurationMs={animStep === "wink" ? WINK_MS : undefined}
        />
      </div>
    </div>
  );
}
