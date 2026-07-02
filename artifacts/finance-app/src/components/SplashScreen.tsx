import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

const SPLASH_SIZE = 120; // px — must match <BadgerLogo size={SPLASH_SIZE} />

type Phase = "showing" | "moving" | "fading";
type Dest  = "home" | "login" | null;

/**
 * Computes exact translate(tx, ty) scale(s) so the 120-px splash logo
 * lands pixel-perfect on the destination logo element in the live DOM.
 *
 * Maths: the splash logo centre starts at (window.innerWidth/2, window.innerHeight/2).
 * After  transform: translate(tx, ty) scale(s), the visual centre moves to
 *   (cx + tx, cy + ty)  — scaling around the element's own centre leaves cx/cy unchanged.
 * So:  tx = targetCX - cx,  ty = targetCY - cy,  s = targetSize / SPLASH_SIZE
 */
function computeTransform(dest: "home" | "login"): string {
  const selector = dest === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]";
  const el = document.querySelector(selector);
  if (!el) {
    // Fallback to hard-coded estimates if the element isn't in the DOM yet
    return dest === "home"
      ? "translate(calc(-50vw + 34px), calc(-50vh + 28px)) scale(0.233)"
      : "translateY(-16vh) scale(0.733)";
  }

  const rect    = el.getBoundingClientRect();
  const targetCX = rect.left + rect.width  / 2;
  const targetCY = rect.top  + rect.height / 2;

  // Splash logo is centred in a fixed full-screen overlay
  const splashCX = window.innerWidth  / 2;
  const splashCY = window.innerHeight / 2;

  const tx    = targetCX - splashCX;
  const ty    = targetCY - splashCY;
  const scale = rect.width / SPLASH_SIZE;

  return `translate(${tx}px, ${ty}px) scale(${scale})`;
}

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase,     setPhase]     = useState<Phase>("showing");
  const [dest,      setDest]      = useState<Dest>(null);
  const [transform, setTransform] = useState<string>("none");
  const [minDone,   setMinDone]   = useState(false);
  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Minimum display time (logo stays on screen ~3.2 s — doubled) ─────────
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), 3200);
    return () => clearTimeout(id);
  }, []);

  // ── Resolve destination and kick off exit sequence ────────────────────────
  useEffect(() => {
    if (!minDone || isLoading || resolvedRef.current) return;
    resolvedRef.current = true;

    const prefs  = loadPrefs();
    const target: "home" | "login" =
      user != null && (prefs.staySignedIn || hasActiveSession()) ? "home" : "login";

    // Measure live DOM positions now — the destination screen is rendered underneath
    const exactTransform = computeTransform(target);

    setDest(target);
    setTransform(exactTransform);
    setPhase("moving");                         // logo glides at full opacity → motion visible

    setTimeout(() => setPhase("fading"), 600);  // 600 ms of pure motion, then start fade (doubled)
    setTimeout(onDone,                  1360);  // remove after fade completes (doubled)
  }, [minDone, isLoading, user, onDone]);

  const isMoving = phase === "moving" || phase === "fading";
  const isFading = phase === "fading";

  return (
    /* Layer 1 — full-screen gradient overlay; only this carries the opacity fade */
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
        transition: isFading ? "opacity 0.72s cubic-bezier(0.4, 0, 1, 1)" : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/* Layer 2 — handles translate + scale; independent of opacity */}
      <div
        style={{
          transform: isMoving ? transform : "none",
          transition: isMoving
            ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)"
            : "none",
          willChange: "transform",
          transformOrigin: "center center",
          lineHeight: 0, // prevent inline element gaps affecting centering
        }}
      >
        {/* Layer 3 — pulse animation only while showing; class removed on exit */}
        <div className={phase === "showing" ? "splash-pulse" : ""}>
          <BadgerLogo size={SPLASH_SIZE} />
        </div>
      </div>
    </div>
  );
}
