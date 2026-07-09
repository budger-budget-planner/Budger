import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

// ── Startup animation sequence ────────────────────────────────────────────────
// sniff at 2× speed → lick at 2.25× speed → wink at normal speed
// Total sequence duration before the exit glide begins: ~2 774 ms
const SNIFF_MS  = Math.round(1400 / 2);     //  700 ms (2× speed)
const LICK_MS   = Math.round(2400 / 2.25);  // 1067 ms (2.25× speed)
const WINK_MS   = 700;                      //  700 ms (normal speed)
const SETTLE_MS = 200;                      //  short pause after wink before gliding away
const GAP_MS    = 100;                      //  idle gap between animations (lets CSS reset)

// Absolute timeouts from mount (t = 0 → sniff starts)
const T_SNIFF_END  = SNIFF_MS;                                  //  700
const T_LICK_START = T_SNIFF_END  + GAP_MS;                    //  800
const T_LICK_END   = T_LICK_START + LICK_MS;                   // 1867
const T_WINK_START = T_LICK_END   + GAP_MS;                    // 1967
const T_SEQ_DONE   = T_WINK_START + WINK_MS + SETTLE_MS;       // 2867

const SPLASH_SIZE = 120; // px — must match <BadgerLogo size={SPLASH_SIZE} />

type AnimStep = "sniff" | "lick" | "wink" | "idle";
type Phase    = "showing" | "moving" | "fading";
type Dest     = "home" | "login" | null;

// ── Transform computation ─────────────────────────────────────────────────────
// Computes translate(tx, ty) + scale(s) so the 120-px splash logo lands
// pixel-perfect on the destination logo element in the live DOM.
// srcEl: the splash logo's translate-layer element — used so the origin is the
// logo's *actual* on-screen center, not an assumed "viewport center" that breaks
// when safe-area padding or group-centering shifts the logo's true position.
type LogoTransform = { translate: string; scale: number };

function measureTarget(destEl: Element, srcEl?: Element | null): LogoTransform {
  const destRect = destEl.getBoundingClientRect();
  const targetCX = destRect.left + destRect.width  / 2;
  const targetCY = destRect.top  + destRect.height / 2;

  // If we have the actual source element, read its center directly.
  // Fall back to viewport center only if the ref is unavailable (shouldn't happen).
  const srcRect  = srcEl?.getBoundingClientRect() ?? null;
  const splashCX = srcRect ? srcRect.left + srcRect.width  / 2 : window.innerWidth  / 2;
  const splashCY = srcRect ? srcRect.top  + srcRect.height / 2 : window.innerHeight / 2;

  return {
    // Round to whole pixels — fractional translate/scale values can make the
    // browser rasterize the incoming logo at a very slightly different size
    // than the resting destination logo, which reads as a "pop"/mismatch
    // right as the two swap. Whole pixels guarantee a 1:1 visual match.
    translate: `translate(${Math.round(targetCX - splashCX)}px, ${Math.round(targetCY - splashCY)}px)`,
    scale: Math.round((destRect.width / SPLASH_SIZE) * 1000) / 1000,
  };
}

function fallbackTransform(dest: "home" | "login"): LogoTransform {
  // Group-centered layout: logo sits ~36 px above viewport center
  // (because the wordmark below shifts the visual group's center down).
  // Adjust the Y fallback to match that actual offset.
  return dest === "home"
    ? { translate: "translate(calc(-50vw + 34px), calc(-50vh + 64px))", scale: 0.35 }
    : { translate: "translateY(-12vh)", scale: 0.733 };
}

// Destination screen (Layout/header or Login) can still be mid-mount — behind
// an auth-loading spinner, or a query resolving a tick later than the splash's
// own — when the splash sequence finishes. Measuring right then can hit the
// hardcoded fallback (element not in the DOM yet) or a not-yet-settled layout,
// so the incoming logo doesn't land 1:1 on the real one. Poll across a few
// animation frames for the real element (and stable position) before giving up.
function computeTransformWhenReady(
  dest: "home" | "login",
  onReady: (t: LogoTransform) => void,
  srcEl?: Element | null,
) {
  const selector = dest === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]";
  let attempts = 0;
  let lastRect: DOMRect | null = null;

  function tick() {
    const el = document.querySelector(selector);
    attempts += 1;

    if (el) {
      const rect = el.getBoundingClientRect();
      // Require two consecutive frames with an identical rect so we don't
      // capture a mid-layout-shift position (e.g. header still reflowing
      // right after mount).
      const stable = lastRect != null
        && rect.left  === lastRect.left  && rect.top    === lastRect.top
        && rect.width === lastRect.width && rect.height === lastRect.height;
      lastRect = rect;
      if (stable) {
        onReady(measureTarget(el, srcEl));
        return;
      }
    }

    if (attempts >= 20) { // ~20 frames (≈330ms @60fps) worst case before giving up
      onReady(el ? measureTarget(el, srcEl) : fallbackTransform(dest));
      return;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
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

  // Ref on the translate layer so we always know the logo's actual screen
  // position at fly-time — no "assume viewport center" math needed.
  const logoRef = useRef<HTMLDivElement>(null);

  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Animation sequence (sniff → lick → wink) ─────────────────────────────
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    // t = T_SNIFF_END:  sniff done → idle gap
    ids.push(setTimeout(() => setAnimStep("idle"), T_SNIFF_END));

    // t = T_LICK_START: start lick (2.25× speed)
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

    setDest(target);

    let cancelled = false;
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    // Measure live DOM positions — destination screen renders underneath the
    // overlay, but may still be mid-mount, so wait for a stable rect first.
    // Pass logoRef.current so translation originates from the logo's true center.
    computeTransformWhenReady(target, ({ translate: tx, scale: sc }) => {
      if (cancelled) return;
      setTranslate(tx);
      setScale(sc);
      setPhase("moving"); // logo glides at full opacity so the motion is clearly visible

      // Fade starts near the end of the glide; removing the splash too early
      // flashes the destination screen while the logo is still mid-flight.
      t1 = setTimeout(() => setPhase("fading"), 950);
      t2 = setTimeout(onDone,                   1400);
    }, logoRef.current);

    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); };
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
        transition: isFading ? "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
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
            logo's true screen center (used by computeTransformWhenReady as
            the origin for the translate vector). */}
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
                Active while showing; stopped when moving so the glide is
                clean. Keeping it active across individual face animations
                prevents a scale-snap when the pulse cycle restarts between
                animations. */}
            <div className={phase === "showing" ? "splash-pulse" : ""}>
              <BadgerLogo
                size={SPLASH_SIZE}
                forceAnim={forceAnim}
                forceAnimDurationMs={forceAnimDurMs}
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
            opacity: phase === "showing" ? 1 : 0,
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
