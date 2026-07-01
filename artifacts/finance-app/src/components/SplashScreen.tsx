import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

/**
 * Three animation phases:
 *   showing  — logo pulses gently, overlay fully opaque
 *   moving   — pulse stops, logo glides + scales to its destination (visible motion)
 *   fading   — overlay fades out while logo is still in motion (overlap feels fluid)
 */
type Phase = "showing" | "moving" | "fading";
type Dest  = "home" | "login" | null;

// Layout measurements (from actual component code):
//   Header  → h-14 (56px), px-5 (20px left pad), BadgerLogo size={28}
//             logo center x = 20 + 14 = 34px from left
//             logo center y = 28px from top
//   Login   → logo (88px) inside a justify-center column with lang row + gaps above it
//             visually sits ~16vh above screen center
const TRANSFORMS: Record<"home" | "login", string> = {
  home:  "translate(calc(-50vw + 34px), calc(-50vh + 28px)) scale(0.233)",
  login: "translateY(-16vh) scale(0.733)",
};

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("showing");
  const [dest,  setDest]  = useState<Dest>(null);
  const [minDone, setMinDone] = useState(false);
  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Minimum display time ──────────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), 1600);
    return () => clearTimeout(id);
  }, []);

  // ── Resolve destination and kick off exit sequence ────────────────────────
  useEffect(() => {
    if (!minDone || isLoading || resolvedRef.current) return;
    resolvedRef.current = true;

    const prefs = loadPrefs();
    const goHome = user != null && (prefs.staySignedIn || hasActiveSession());
    const target: Dest = goHome ? "home" : "login";

    setDest(target);
    setPhase("moving");                         // t=0  : logo starts moving (opacity stays 1)

    setTimeout(() => setPhase("fading"), 280);  // t=280ms: start fading while logo still moves
    setTimeout(onDone, 680);                    // t=680ms: remove component after fade done
  }, [minDone, isLoading, user, onDone]);

  // ── Derive styles per phase ───────────────────────────────────────────────
  const isMoving     = phase === "moving" || phase === "fading";
  const isFading     = phase === "fading";
  const logoTransform = (isMoving && dest) ? TRANSFORMS[dest] : "none";

  return (
    // Layer 1 — full-screen gradient overlay; only this fades
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background:
          "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: isFading ? 0 : 1,
        transition: isFading ? "opacity 0.38s cubic-bezier(0.4, 0, 1, 1)" : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/* Layer 2 — handles translate + scale; independent of opacity */}
      <div
        style={{
          transform: logoTransform,
          // Longer duration so motion is clearly visible even as the overlay fades
          transition: isMoving
            ? "transform 0.62s cubic-bezier(0.4, 0, 0.2, 1)"
            : "none",
          willChange: "transform",
          transformOrigin: "center center",
        }}
      >
        {/* Layer 3 — pulse animation only during "showing"; class removed on exit */}
        <div className={phase === "showing" ? "splash-pulse" : ""}>
          <BadgerLogo size={120} />
        </div>
      </div>
    </div>
  );
}
