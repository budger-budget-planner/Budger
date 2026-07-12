import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

// ── Startup animation sequence ────────────────────────────────────────────────
// sniff at 2× speed → lick at 2.25× speed → reposition
// Total sequence duration before the exit glide begins: ~2 067 ms
const SNIFF_MS  = Math.round(1400 / 2);     //  700 ms (2× speed)
const LICK_MS   = Math.round(2400 / 2.25);  // 1067 ms (2.25× speed)
const SETTLE_MS = 200;                      //  short pause after lick before gliding away
const GAP_MS    = 100;                      //  idle gap between animations (lets CSS reset)

// Absolute timeouts from mount (t = 0 → sniff starts)
const T_SNIFF_END  = SNIFF_MS;
const T_LICK_START = T_SNIFF_END  + GAP_MS;
const T_LICK_END   = T_LICK_START + LICK_MS;
const T_SEQ_DONE   = T_LICK_END   + SETTLE_MS;

const SPLASH_SIZE = 120; // px — must match <BadgerLogo size={SPLASH_SIZE} />

type AnimStep = "sniff" | "lick" | "idle";
type Phase    = "showing" | "moving" | "fading";
type Dest     = "home" | "login" | null;

// ── Transform types ──────────────────────────────────────────────────────────
type LogoTransform = { translate: string; scale: number };

// ── Measurement helpers ───────────────────────────────────────────────────────
function measureLogoTarget(destEl: Element, srcEl?: Element | null): LogoTransform {
  const destRect = destEl.getBoundingClientRect();
  const targetCX = destRect.left + destRect.width  / 2;
  const targetCY = destRect.top  + destRect.height / 2;

  const srcRect  = srcEl?.getBoundingClientRect() ?? null;
  const splashCX = srcRect ? srcRect.left + srcRect.width  / 2 : window.innerWidth  / 2;
  const splashCY = srcRect ? srcRect.top  + srcRect.height / 2 : window.innerHeight / 2;

  return {
    translate: `translate(${Math.round(targetCX - splashCX)}px, ${Math.round(targetCY - splashCY)}px)`,
    scale: Math.round((destRect.width / SPLASH_SIZE) * 1000) / 1000,
  };
}

function measureWordmarkTarget(destEl: Element, srcEl?: Element | null): LogoTransform {
  const destRect = destEl.getBoundingClientRect();
  const targetCX = destRect.left + destRect.width  / 2;
  const targetCY = destRect.top  + destRect.height / 2;

  const srcRect  = srcEl?.getBoundingClientRect() ?? null;
  const srcCX    = srcRect ? srcRect.left + srcRect.width  / 2 : window.innerWidth  / 2;
  const srcCY    = srcRect ? srcRect.top  + srcRect.height / 2 : window.innerHeight / 2;

  // Scale by rendered height ratio (title + tagline block), fallback to known font ratio
  const scale = srcRect && srcRect.height > 0
    ? Math.round((destRect.height / srcRect.height) * 1000) / 1000
    : Math.round((48 / 38) * 1000) / 1000;

  return {
    translate: `translate(${Math.round(targetCX - srcCX)}px, ${Math.round(targetCY - srcCY)}px)`,
    scale,
  };
}

function fallbackTransform(dest: "home" | "login"): LogoTransform {
  return dest === "home"
    ? { translate: "translate(calc(-50vw + 34px), calc(-50vh + 64px))", scale: 0.35 }
    : { translate: "translateY(-12vh)", scale: 0.733 };
}

// ── Generic polling helper ────────────────────────────────────────────────────
// Waits for `selector` to appear and its rect to be stable across two consecutive
// frames, then calls onReady with the measured transform. Returns a cancel
// function so the RAF loop can be stopped on unmount or cleanup.
//
// onReady receives null when the element was not found within the poll window —
// callers must treat null as "skip this animation, fall back to fade".
function pollForTransform(
  selector: string,
  measure: (destEl: Element, srcEl?: Element | null) => LogoTransform,
  onReady: (t: LogoTransform | null) => void,
  srcEl?: Element | null,
): () => void {
  let cancelled = false;
  let attempts  = 0;
  let lastRect: DOMRect | null = null;

  function tick() {
    if (cancelled) return;
    const el = document.querySelector(selector);
    attempts++;

    if (el) {
      const rect   = el.getBoundingClientRect();
      const stable =
        lastRect != null &&
        rect.left  === lastRect.left  && rect.top    === lastRect.top &&
        rect.width === lastRect.width && rect.height === lastRect.height;
      lastRect = rect;
      if (stable) { onReady(measure(el, srcEl)); return; }
    }

    if (attempts >= 20) {
      // Element not found → null tells the caller to degrade gracefully
      onReady(el ? measure(el, srcEl) : null);
      return;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  return () => { cancelled = true; };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  // Animation sequence state
  const [animStep,  setAnimStep]  = useState<AnimStep>("sniff");
  const [animDurMs, setAnimDurMs] = useState<number>(SNIFF_MS);
  const [seqDone,   setSeqDone]   = useState(false);

  // Exit-glide state — logo
  const [phase,     setPhase]     = useState<Phase>("showing");
  const [dest,      setDest]      = useState<Dest>(null);
  const [translate, setTranslate] = useState<string>("none");
  const [scale,     setScale]     = useState<number>(1);

  // Exit-glide state — wordmark
  // wordmarkFound tracks whether the destination element was actually measured;
  // when false the wordmark fades out instead of flying (safe degradation).
  const [wordmarkTranslate, setWordmarkTranslate] = useState<string>("none");
  const [wordmarkScale,     setWordmarkScale]     = useState<number>(1);
  const [wordmarkFound,     setWordmarkFound]     = useState(false);

  // Refs for source-element measurement at fly-time
  const logoRef     = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);

  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Animation sequence (sniff → lick → wink) ─────────────────────────────
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    ids.push(setTimeout(() => setAnimStep("idle"), T_SNIFF_END));
    ids.push(setTimeout(() => { setAnimStep("lick"); setAnimDurMs(LICK_MS); }, T_LICK_START));
    ids.push(setTimeout(() => { setAnimStep("idle"); setSeqDone(true); }, T_SEQ_DONE));

    return () => ids.forEach(clearTimeout);
  }, []);

  // ── Exit sequence ────────────────────────────────────────────────────────
  // Fires once the face sequence is done AND auth has resolved. Polls the DOM
  // for destination rects, waits until ALL required measurements are stable,
  // then starts the exit glide. Logo and wordmark fly in sync.
  //
  // If the wordmark destination element can't be found within the poll window
  // (null), the wordmark falls back to its existing fade-out behaviour so the
  // glide still looks correct — the logo is never blocked.
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

    // Gate: enter "moving" only after all required transforms are resolved.
    let logoT:     LogoTransform | null = null;
    let wordmarkT: LogoTransform | null = null;    // null = not found → fade instead
    const needed = target === "login" ? 2 : 1;
    let resolved = 0;

    function onAllReady() {
      resolved++;
      if (resolved < needed || cancelled) return;

      setTranslate(logoT!.translate);
      setScale(logoT!.scale);

      if (wordmarkT) {
        setWordmarkTranslate(wordmarkT.translate);
        setWordmarkScale(wordmarkT.scale);
        setWordmarkFound(true);
      }
      // If wordmarkT is null the wordmark stays at opacity:0 (fade path, see render)

      setPhase("moving");
      t1 = setTimeout(() => setPhase("fading"), 1050); // give logo time to land before home bleeds through
      t2 = setTimeout(onDone,                   1400);
    }

    // Poll for logo destination
    const cancelLogo = pollForTransform(
      target === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]",
      measureLogoTarget,
      (t) => { logoT = t ?? fallbackTransform(target); onAllReady(); },
      logoRef.current,
    );

    // Poll for wordmark destination (login only; no wordmark on home header)
    let cancelWordmark: (() => void) | null = null;
    if (target === "login") {
      cancelWordmark = pollForTransform(
        "[data-splash-wordmark-login]",
        measureWordmarkTarget,
        (t) => { wordmarkT = t; onAllReady(); },  // null → degrade to fade
        wordmarkRef.current,
      );
    }

    return () => {
      cancelled = true;
      cancelLogo();
      cancelWordmark?.();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [seqDone, isLoading, user, onDone]);

  const isMoving = phase === "moving" || phase === "fading";
  const isFading = phase === "fading";

  // Wordmark flies only when going to login AND the destination was found.
  // Falls back to the existing fade-out if the element wasn't measured in time.
  const wordmarkFlying = isMoving && dest === "login" && wordmarkFound;

  const forceAnim      = animStep !== "idle" ? animStep : null;
  const forceAnimDurMs = forceAnim != null ? animDurMs : undefined;

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
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        opacity: isFading ? 0 : 1,
        transition: isFading ? "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
        pointerEvents: isMoving ? "none" : "auto",
      }}
    >
      {/*
        Column group — logo + wordmark centered together as a visual unit.
        Each child animates on its own translate + scale layers during the exit
        glide so they can land on separate DOM targets independently.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        {/* ── Logo: translate layer ─────────────────────────────────────────
            Ref gives the logo's true on-screen center for vector computation. */}
        <div
          ref={logoRef}
          style={{
            transform: isMoving ? translate : "none",
            transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            willChange: "transform",
            lineHeight: 0,
          }}
        >
          {/* ── Logo: scale layer ─────────────────────────────────────────
              Separate element keeps translate and scale independent —
              combined matrix interpolation would warp a non-square element. */}
          <div
            style={{
              transform: isMoving ? `scale(${scale})` : "none",
              transition: isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
              willChange: "transform",
              transformOrigin: "center center",
              lineHeight: 0,
            }}
          >
            {/* ── Pulse layer ───────────────────────────────────────────
                Active while showing; stopped when moving so the glide is clean. */}
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

        {/* ── Wordmark: translate layer ──────────────────────────────────────
            When going to login AND the destination was measured: flies from
            splash center to login position, scaling to match rendered size.
            Degraded path (wordmarkFound=false): fades out when logo starts
            moving, same as the original behaviour. */}
        <div
          ref={wordmarkRef}
          style={{
            transform: wordmarkFlying ? wordmarkTranslate : "none",
            transition: wordmarkFlying ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            willChange: wordmarkFlying ? "transform" : "auto",
            pointerEvents: "none",
          }}
        >
          {/* ── Wordmark: scale layer ─────────────────────────────────────
              Same separate-layer pattern as the logo. Opacity is applied
              directly on BudgerWordmark's root div (via style prop) rather
              than on any ancestor wrapper. A parent-only opacity transition
              can fail to cascade on iOS Safari when the child renders
              -webkit-background-clip:text (gradient wordmark), leaving the
              text visible. Direct application sidesteps the compositing bug. */}
          <div
            style={{
              transform: wordmarkFlying ? `scale(${wordmarkScale})` : "none",
              transition: wordmarkFlying
                ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)"
                : "none",
              willChange: wordmarkFlying ? "transform" : "auto",
              transformOrigin: "center center",
            }}
          >
            <BudgerWordmark
              size={38}
              tagline="Budget Planner"
              style={{
                // Flying to login: always visible (overlay fade handles disappearance)
                // Going to home or degraded: fade out immediately when movement starts.
                // Use filter:opacity() rather than opacity so the gradient-clip text
                // (–webkit-background-clip:text) is composited before the transparency
                // is applied — this sidesteps the iOS Safari bug where opacity on a
                // parent wrapper fails to propagate through gradient-clip compositing.
                filter: wordmarkFlying ? "none" : (phase === "showing" ? "none" : "opacity(0%)"),
                transition: wordmarkFlying ? "none" : "filter 0.15s linear",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
