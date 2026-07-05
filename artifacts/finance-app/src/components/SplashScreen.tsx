import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

// ── Startup animation sequence ────────────────────────────────────────────────
// sniff at 2× speed → lick at 1.5× speed → wink at normal speed
// Total sequence duration before the exit glide begins: ~3 400 ms
const SNIFF_MS  = Math.round(1400 / 2);    // 700 ms  (2× speed)
const LICK_MS   = Math.round(2400 / 1.5);  // 1600 ms (1.5× speed)
const WINK_MS   = 700;                      // normal speed
const SETTLE_MS = 200;                      // short pause after wink before gliding away
const GAP_MS    = 100;                      // idle gap between animations (lets CSS reset)

// Absolute timeouts from mount (t = 0 → sniff starts)
const T_SNIFF_END  = SNIFF_MS;                                   //  700
const T_LICK_START = T_SNIFF_END  + GAP_MS;                     //  800
const T_LICK_END   = T_LICK_START + LICK_MS;                    // 2400
const T_WINK_START = T_LICK_END   + GAP_MS;                     // 2500
const T_SEQ_DONE   = T_WINK_START + WINK_MS + SETTLE_MS;        // 3400

const SPLASH_SIZE = 120; // px — must match <BadgerLogo size={SPLASH_SIZE} />

type AnimStep = "sniff" | "lick" | "wink" | "idle";
type Phase    = "showing" | "moving" | "fading";
type Dest     = "home" | "login" | null;

// ── Transform computation ─────────────────────────────────────────────────────
// Computes translate(tx, ty) + scale(s) so the 120-px splash logo lands
// pixel-perfect on the destination logo element in the live DOM.
type LogoTransform = { translate: string; scale: number };

function computeTransform(dest: "home" | "login"): LogoTransform {
  const selector = dest === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]";
  const el = document.querySelector(selector);
  if (!el) {
    return dest === "home"
      ? { translate: "translate(calc(-50vw + 34px), calc(-50vh + 28px))", scale: 0.35 }
      : { translate: "translateY(-16vh)", scale: 0.733 };
  }

  const rect     = el.getBoundingClientRect();
  const targetCX = rect.left + rect.width  / 2;
  const targetCY = rect.top  + rect.height / 2;
  const splashCX = window.innerWidth  / 2;
  const splashCY = window.innerHeight / 2;

  return {
    translate: `translate(${targetCX - splashCX}px, ${targetCY - splashCY}px)`,
    scale: rect.width / SPLASH_SIZE,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  // Animation sequence state — initialised to "sniff" so the first animation
  // starts the moment the component mounts (no extra timeout needed at t=0).
  const [animStep,   setAnimStep]   = useState<AnimStep>("sniff");
  const [animDurMs,  setAnimDurMs]  = useState<number>(SNIFF_MS);
  const [seqDone,    setSeqDone]    = useState(false);

  // Exit-glide state
  const [phase,     setPhase]     = useState<Phase>("showing");
  const [dest,      setDest]      = useState<Dest>(null);
  const [translate, setTranslate] = useState<string>("none");
  const [scale,     setScale]     = useState<number>(1);

  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Animation sequence (sniff → lick → wink) ─────────────────────────────
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    // t = T_SNIFF_END:  sniff done → idle gap
    ids.push(setTimeout(() => setAnimStep("idle"), T_SNIFF_END));

    // t = T_LICK_START: start lick (1.5× speed)
    ids.push(setTimeout(() => {
      setAnimStep("lick");
      setAnimDurMs(LICK_MS);
    }, T_LICK_START));

    // t = T_LICK_END:   lick done → idle gap
    ids.push(setTimeout(() => setAnimStep("idle"), T_LICK_END));

    // t = T_WINK_START: start wink (normal speed)
    ids.push(setTimeout(() => {
      setAnimStep("wink");
      setAnimDurMs(WINK_MS);
    }, T_WINK_START));

    // t = T_SEQ_DONE:   sequence complete — exit can begin once auth also resolved
    ids.push(setTimeout(() => {
      setAnimStep("idle");
      setSeqDone(true);
    }, T_SEQ_DONE));

    return () => ids.forEach(clearTimeout);
  }, []);

  // ── Exit sequence (runs once both sequence AND auth are done) ────────────
  useEffect(() => {
    if (!seqDone || isLoading || resolvedRef.current) return;
    resolvedRef.current = true;

    const prefs  = loadPrefs();
    const target: "home" | "login" =
      user != null && (prefs.staySignedIn || hasActiveSession()) ? "home" : "login";

    // Measure live DOM positions — destination screen renders underneath the overlay
    const { translate: tx, scale: sc } = computeTransform(target);

    setDest(target);
    setTranslate(tx);
    setScale(sc);
    setPhase("moving"); // logo glides at full opacity so the motion is clearly visible

    // Fade starts near the end of the glide; removing the splash too early flashes
    // the destination screen while the logo is still mid-flight (looks jarring).
    setTimeout(() => setPhase("fading"), 950);
    setTimeout(onDone,                   1400);
  }, [seqDone, isLoading, user, onDone]);

  const isMoving = phase === "moving" || phase === "fading";
  const isFading = phase === "fading";

  // Pass the current animation and its overridden duration to the logo.
  // forceAnimDurationMs is only set during the splash sequence; the logo's own
  // idle-interval animations (every 10 s in the main app) always use their
  // default durations and are unaffected.
  const forceAnim      = animStep !== "idle" ? animStep : null;
  const forceAnimDurMs = forceAnim != null ? animDurMs : undefined;

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
      {/* Layer 2 — handles translate only; kept separate from scale so the browser
          interpolates each transform linearly rather than combining them into a matrix
          (combined matrix interpolation warps the logo as it glides). */}
      <div
        style={{
          transform: isMoving ? translate : "none",
          transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
          willChange: "transform",
          lineHeight: 0,
        }}
      >
        {/* Layer 2b — handles scale only, nested inside the translate layer */}
        <div
          style={{
            transform: isMoving ? `scale(${scale})` : "none",
            transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            willChange: "transform",
            transformOrigin: "center center",
            lineHeight: 0,
          }}
        >
          {/* Layer 3 — pulse while showing; stops when moving so the glide is clean.
              Keeping the class active during individual face animations prevents a
              scale-snap when the pulse cycle restarts between animations. */}
          <div className={phase === "showing" ? "splash-pulse" : ""}>
            <BadgerLogo
              size={SPLASH_SIZE}
              forceAnim={forceAnim}
              forceAnimDurationMs={forceAnimDurMs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
