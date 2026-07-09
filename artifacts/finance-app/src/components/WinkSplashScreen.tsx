import { useEffect, useRef, useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";

// Must match SplashScreen.tsx so the logo lands at the same size
const SPLASH_SIZE = 120;

const STILL_MS   = 900;   // float before wink
const WINK_MS    = 700;   // wink duration
const FLY_MS     = 1240;  // translate+scale transition — matches SplashScreen exactly
const FADE_DELAY = 950;   // start fading this far into the fly (ms) — logo nearly arrived
const FADE_MS    = 450;   // overlay fade-out duration

type Phase = "float" | "wink" | "fly" | "fade";

export default function WinkSplashScreen({ onDone }: { onDone?: () => void }) {
  const [phase,     setPhase]     = useState<Phase>("float");
  const [translate, setTranslate] = useState("none");
  const [scale,     setScale]     = useState(1);

  // Store onDone in a ref so the effect (which runs once) always calls the
  // latest version — avoids the "new inline function = timer reset" trap.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Ref on the translate layer so we read the logo's actual screen center at
  // fly-time rather than assuming it lives at exactly window.innerWidth/2,
  // window.innerHeight/2 (not true once the logo+wordmark group is centered
  // as a unit and safe-area padding is applied).
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    // Float → Wink
    ids.push(setTimeout(() => setPhase("wink"), STILL_MS));

    // Wink done → compute target → fly
    ids.push(setTimeout(() => {
      const destEl = document.querySelector("[data-splash-logo-home]") as HTMLElement | null;

      if (destEl) {
        const destRect  = destEl.getBoundingClientRect();
        const targetCX  = destRect.left + destRect.width  / 2;
        const targetCY  = destRect.top  + destRect.height / 2;

        // Use the translate layer's actual rect as the origin so the vector is
        // always correct regardless of safe-area insets or group-centering offset.
        const srcEl    = logoRef.current;
        const srcRect  = srcEl ? srcEl.getBoundingClientRect() : null;
        const splashCX = srcRect ? srcRect.left + srcRect.width  / 2 : window.innerWidth  / 2;
        const splashCY = srcRect ? srcRect.top  + srcRect.height / 2 : window.innerHeight / 2;

        // Round to whole pixels so the incoming logo rasterizes at exactly the
        // same size as the resting header logo — avoids a subtle 1-px mismatch
        // right as the overlay fades away.
        setTranslate(`translate(${Math.round(targetCX - splashCX)}px, ${Math.round(targetCY - splashCY)}px)`);
        setScale(Math.round((destRect.width / SPLASH_SIZE) * 1000) / 1000);
      } else {
        // Fallback: header not mounted yet (rare). Y offset accounts for the
        // logo being ~36 px above viewport center in the group-centered layout.
        setTranslate("translate(calc(-50vw + 34px), calc(-50vh + 64px))");
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

  const isMoving  = phase === "fly" || phase === "fade";
  const isFading  = phase === "fade";
  // Keep pulse during wink so there's no scale-snap when the phase changes
  const showPulse = phase === "float" || phase === "wink";

  return (
    /* Full-screen gradient overlay — only this div carries the opacity fade. */
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
        // Respect iOS safe-area insets (notch + home indicator) so the content
        // is centered in the *visible* area, not the raw full-screen rect.
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        opacity: isFading ? 0 : 1,
        transition: isFading ? "opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/*
        Column group — logo + wordmark centered together as a visual unit.
        Centering only the logo left the wordmark hanging below, making the
        pair feel low. Centering the pair means the logo sits slightly above
        the viewport midpoint, which matches the human eye's optical center.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        {/* ── Translate layer ─────────────────────────────────────────────
            Ref lives here so getBoundingClientRect() at fly-time gives the
            logo's true screen center (used above to build the translate vector). */}
        <div
          ref={logoRef}
          style={{
            transform: isMoving ? translate : "none",
            transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            willChange: "transform",
            lineHeight: 0,
          }}
        >
          {/* ── Scale layer ─────────────────────────────────────────────
              Separate from translate so the browser interpolates each axis
              independently — combined matrix interpolation warps the logo
              mid-flight. */}
          <div
            style={{
              transform: isMoving ? `scale(${scale})` : "none",
              transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
              willChange: "transform",
              transformOrigin: "center center",
              lineHeight: 0,
            }}
          >
            {/* ── Pulse layer ─────────────────────────────────────────
                Active during float + wink, stopped on fly so the glide
                isn't fighting against a competing transform. */}
            <div className={showPulse ? "splash-pulse" : ""}>
              <BadgerLogo
                size={SPLASH_SIZE}
                forceAnim={phase === "wink" ? "wink" : null}
                forceAnimDurationMs={phase === "wink" ? WINK_MS : undefined}
                growPulse={false}
              />
            </div>
          </div>
        </div>

        {/* ── Wordmark + tagline ───────────────────────────────────────────
            Sits below the logo in normal flow (no absolute positioning),
            so the browser's flex centering treats logo+wordmark as one unit.
            Fades out the instant the logo begins its glide to the header. */}
        <div
          style={{
            opacity: showPulse ? 1 : 0,
            transition: "opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "none",
          }}
        >
          <BudgerWordmark size={38} tagline="Budget Planner" />
        </div>
      </div>
    </div>
  );
}
