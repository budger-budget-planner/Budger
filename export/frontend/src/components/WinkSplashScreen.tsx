import { useEffect, useRef, useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";

// Must match SplashScreen.tsx so the logo lands at the same size
const SPLASH_SIZE = 180;

const STILL_MS   = 900;   // float before wink
const WINK_MS    = 490;   // wink duration (30% faster)
const FLY_MS     = 1240;  // translate+scale transition — matches SplashScreen exactly
const FADE_DELAY = 1050;  // start fading this far into the fly (ms) — logo nearly arrived
const FADE_MS    = 250;   // overlay fade-out duration

type Phase = "float" | "wink" | "hold" | "fly" | "fade";

export default function WinkSplashScreen({
  onReady,
  onDone,
}: {
  onReady?: () => void | Promise<void>;
  onDone?: () => void;
}) {
  const [phase,     setPhase]     = useState<Phase>("float");
  const [translate, setTranslate] = useState("none");
  const [scale,     setScale]     = useState(1);

  // Store callbacks in refs so the effect (which runs once) always calls the
  // latest versions — avoiding the "new inline function = timer reset" trap.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Ref on the translate layer so we read the logo's actual screen center at
  // fly-time rather than assuming it lives at exactly window.innerWidth/2,
  // window.innerHeight/2 (not true once the logo+wordmark group is centered
  // as a unit and safe-area padding is applied).
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let animationFrame: number | null = null;
    const ids = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (delayMs: number, callback: () => void) => {
      const id = setTimeout(() => {
        ids.delete(id);
        if (!cancelled) callback();
      }, delayMs);
      ids.add(id);
    };

    const startFly = () => {
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
        setScale(0.37);
      }

      setPhase("fly");
      // Start fading mid-flight so the logo is visibly moving before it disappears.
      schedule(FADE_DELAY, () => {
        setPhase("fade");
        schedule(FLY_MS + FADE_MS - FADE_DELAY, () => onDoneRef.current?.());
      });
    };

    // Float → wink → hold. Keep the complete splash visible while the caller
    // finishes background work and reveals the refreshed app beneath it.
    schedule(STILL_MS, () => {
      setPhase("wink");
      schedule(WINK_MS, () => {
        setPhase("hold");
        void (async () => {
          try {
            await onReadyRef.current?.();
          } catch (error) {
            console.error("[wink-splash] background preparation failed", error);
          }
          if (cancelled) return;
          // Let React commit the refreshed route tree before measuring the
          // header-logo destination for the fly animation.
          animationFrame = requestAnimationFrame(() => {
            animationFrame = null;
            if (!cancelled) startFly();
          });
        })();
      });
    });

    return () => {
      cancelled = true;
      ids.forEach(clearTimeout);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, []); // empty — run once on mount, use ref for onDone

  const isMoving  = phase === "fly" || phase === "fade";
  const isFading  = phase === "fade";
  // Keep the breathing logo and wordmark visible throughout the hold state.
  const showPulse = phase === "float" || phase === "wink" || phase === "hold";

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
        transition: isFading ? "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
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
                pauseIdleAnimations
                growPulse={false}
              />
            </div>
          </div>
        </div>

        {/* ── Wordmark + tagline ───────────────────────────────────────────
            Opacity applied directly to BudgerWordmark's root div (via style
            prop) rather than on a parent wrapper. A parent-only opacity
            transition can fail to propagate correctly on iOS Safari when the
            child contains -webkit-background-clip:text (gradient wordmark),
            causing the text to remain visible. Direct application avoids the
            compositing issue. Fades out the instant the logo begins its glide. */}
        <BudgerWordmark
          size={38}
          tagline="Budget Planner"
          style={{
            // filter:opacity() rather than opacity — creates an isolated compositing
            // context so -webkit-background-clip:text children are flattened first,
            // sidestepping the iOS Safari bug where parent opacity fails to hide
            // gradient-clipped text.
            filter: showPulse ? "none" : "opacity(0%)",
            transition: "filter 0.15s linear",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
