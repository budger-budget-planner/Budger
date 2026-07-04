import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

// Duration of the wink animation + a short settle pause before moving
const WINK_MS = 1400 + 200;

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
type LogoTransform = { translate: string; scale: number };

// Translate and scale are kept as two *separate* transforms (applied on nested
// elements, each with its own transition) rather than combined into one
// `translate(...) scale(...)` string. When both are animated together as a
// single `transform`, the browser interpolates the combined matrix rather than
// each component linearly — which visibly warps the resize (the logo appears
// to swell/shrink unevenly instead of scaling smoothly as it glides). Splitting
// them keeps both animations perfectly linear and in sync.
function computeTransform(dest: "home" | "login"): LogoTransform {
  const selector = dest === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]";
  const el = document.querySelector(selector);
  if (!el) {
    // Fallback to hard-coded estimates if the element isn't in the DOM yet
    return dest === "home"
      ? { translate: "translate(calc(-50vw + 34px), calc(-50vh + 28px))", scale: 0.35 }
      : { translate: "translateY(-16vh)", scale: 0.733 };
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

  return { translate: `translate(${tx}px, ${ty}px)`, scale };
}

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase,     setPhase]     = useState<Phase>("showing");
  const [dest,      setDest]      = useState<Dest>(null);
  const [translate, setTranslate] = useState<string>("none");
  const [scale,     setScale]     = useState<number>(1);
  const [minDone,   setMinDone]   = useState(false);
  const [winking,   setWinking]   = useState(false);
  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Minimum display time (logo stays on screen ~3.2 s) ───────────────────
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), 3200);
    return () => clearTimeout(id);
  }, []);

  // ── Resolve destination and kick off exit sequence ────────────────────────
  useEffect(() => {
    if (!minDone || isLoading || resolvedRef.current) return;
    resolvedRef.current = true;

    // Wink at the user first, then glide to the destination
    setWinking(true);
    setTimeout(() => {
      setWinking(false);

      const prefs  = loadPrefs();
      const target: "home" | "login" =
        user != null && (prefs.staySignedIn || hasActiveSession()) ? "home" : "login";

      // Measure live DOM positions now — the destination screen is rendered underneath
      const { translate: exactTranslate, scale: exactScale } = computeTransform(target);

      setDest(target);
      setTranslate(exactTranslate);
      setScale(exactScale);
      setPhase("moving");                        // logo glides at full opacity → motion visible

      // Let the glide run almost to completion before the background starts to fade —
      // fading too early made the destination screen "flash" into view while the logo
      // was still clearly mid-flight, which read as clunky/jarring.
      setTimeout(() => setPhase("fading"), 950); // fade starts near the end of the glide
      setTimeout(onDone,                  1400); // remove shortly after the fade completes
    }, WINK_MS);
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
        transition: isFading ? "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/* Layer 2 — handles translate only; independent of scale and opacity so the
          browser interpolates each transform linearly instead of one combined matrix */}
      <div
        style={{
          transform: isMoving ? translate : "none",
          transition: isMoving
            ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)"
            : "none",
          willChange: "transform",
          lineHeight: 0, // prevent inline element gaps affecting centering
        }}
      >
        {/* Layer 2b — handles scale only, nested inside the translate layer */}
        <div
          style={{
            transform: isMoving ? `scale(${scale})` : "none",
            transition: isMoving
              ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
            willChange: "transform",
            transformOrigin: "center center",
            lineHeight: 0,
          }}
        >
          {/* Layer 3 — pulse while idle; stops when winking or moving */}
          <div className={phase === "showing" && !winking ? "splash-pulse" : ""}>
            <BadgerLogo size={SPLASH_SIZE} forceAnim={winking ? "wink" : null} />
          </div>
        </div>
      </div>
    </div>
  );
}
