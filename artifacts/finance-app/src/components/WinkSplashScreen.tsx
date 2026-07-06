import { useEffect, useRef, useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";

// Must match SplashScreen.tsx so the logo lands at the same size
const SPLASH_SIZE = 120;

const STILL_MS    = 900;   // float before wink
const WINK_MS     = 700;   // wink duration
const FLY_MS      = 1000;  // translate+scale transition
const FADE_DELAY  = 650;   // start fading this far into the fly (ms)
const FADE_MS     = 350;   // overlay fade-out duration

type Phase = "float" | "wink" | "fly" | "fade";

export default function WinkSplashScreen({ onDone }: { onDone?: () => void }) {
  const [phase,     setPhase]     = useState<Phase>("float");
  const [translate, setTranslate] = useState("none");
  const [scale,     setScale]     = useState(1);

  // Store onDone in a ref so the effect (which runs once) always calls the
  // latest version — avoids the "new inline function = timer reset" trap.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    // Float → Wink
    ids.push(setTimeout(() => setPhase("wink"), STILL_MS));

    // Wink done → compute target → fly
    ids.push(setTimeout(() => {
      const el = document.querySelector("[data-splash-logo-home]") as HTMLElement | null;
      if (el) {
        const rect    = el.getBoundingClientRect();
        const targetCX = rect.left + rect.width  / 2;
        const targetCY = rect.top  + rect.height / 2;
        const tx = targetCX - window.innerWidth  / 2;
        const ty = targetCY - window.innerHeight / 2;
        setTranslate(`translate(${tx}px, ${ty}px)`);
        setScale(rect.width / SPLASH_SIZE);
      } else {
        // Fallback if header isn't mounted yet
        setTranslate("translate(calc(-50vw + 34px), calc(-50vh + 28px))");
        setScale(0.35);
      }
      setPhase("fly");
    }, STILL_MS + WINK_MS));

    // Start fading mid-flight so the logo is visibly moving before it disappears
    ids.push(setTimeout(() => setPhase("fade"), STILL_MS + WINK_MS + FADE_DELAY));

    // Notify caller after everything is done
    ids.push(setTimeout(
      () => onDoneRef.current?.(),
      STILL_MS + WINK_MS + FLY_MS + FADE_MS,
    ));

    return () => ids.forEach(clearTimeout);
  }, []); // empty — run once on mount, use ref for onDone

  const isMoving = phase === "fly" || phase === "fade";
  const isFading = phase === "fade";
  // Keep pulse during wink so there's no scale-snap when the phase changes
  const showPulse = phase === "float" || phase === "wink";

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
        opacity: isFading ? 0 : 1,
        transition: isFading ? `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/* Translate layer — separate from scale so the browser interpolates each
          independently (combined matrix interpolation warps the logo mid-flight) */}
      <div
        style={{
          transform: isMoving ? translate : "none",
          transition: isMoving ? `transform ${FLY_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
          willChange: "transform",
          lineHeight: 0,
        }}
      >
        {/* Scale layer */}
        <div
          style={{
            transform: isMoving ? `scale(${scale})` : "none",
            transition: isMoving ? `transform ${FLY_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
            willChange: "transform",
            transformOrigin: "center center",
            lineHeight: 0,
          }}
        >
          {/* Pulse layer — active during float + wink, stopped on fly so the
              glide isn't fighting against a competing transform */}
          <div className={showPulse ? "splash-pulse" : ""}>
            <BadgerLogo
              size={SPLASH_SIZE}
              forceAnim={phase === "wink" ? "wink" : null}
              forceAnimDurationMs={phase === "wink" ? WINK_MS : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
