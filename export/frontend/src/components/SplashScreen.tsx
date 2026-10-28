import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@/lib/api-client";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";
import { prefetchHomeData } from "@/lib/prefetch";
import { hasActiveSession, loadPrefs } from "@/lib/prefs";

// ── Intro phase timing ────────────────────────────────────────────────────────
// Phase 1 "bigText"  : large wordmark centered, logo invisible (holds 700 ms)
// Phase 2 "shrinkText": logo fades/scales in, wordmark contracts (CSS 800 ms transition)
// Phase 3 "showing"  : normal float — logo 120 px, wordmark 38 px
const INTRO_BIG_MS         = 1200;  // how long bigText holds
const INTRO_TRANSITION_MS  = 800;   // CSS transition duration for shrinkText
const FLOAT_START_MS       = INTRO_BIG_MS + INTRO_TRANSITION_MS; // 2 000 ms
const PULSE_CYCLE_MS       = 2_000; // keep in sync with .splash-intro-pulse in index.css
const READINESS_APPEAR_DELAY_MS = 5_000; // measured from the start of the logo pulse
const READINESS_FADE_MS    = 800; // keep in sync with .splash-readiness transition in index.css
const READINESS_FAKE_DELAY_MS = 2_000;
const READINESS_FAKE_PERCENT = 17;

// ── Float sequence timing (absolute from mount) ───────────────────────────────
// sniff at 2× speed → lick at ~1.8× speed → glide to destination
const SNIFF_MS  = Math.round(1400 / 2);    //  700 ms (2× speed)
const LICK_MS   = Math.round(2400 / 1.8);  // 1 333 ms (~1.8× speed)
const SETTLE_MS = 200;
const GAP_MS    = 100;

// ── Splash exit timing ────────────────────────────────────────────────────────
// A resize/orientation change can keep a destination marker moving while the
// browser settles its viewport. Never let that measurement hold the full-screen
// overlay forever; the destination can still render correctly using the
// position-safe fallback transform.
const EXIT_MEASURE_TIMEOUT_MS = 1500;

// ── Sizes ─────────────────────────────────────────────────────────────────────
const SPLASH_SIZE = 180; // px — must match <BadgerLogo size={SPLASH_SIZE} />

// Wordmark in float state: 38 px (matches BudgerWordmark default).
// Login destination: 48 px (BudgerWordmark size={48} in Login.tsx).
// Scale factor: 48/38 = 1.263 — used as fallback if DOM measurement fails.
const WORDMARK_SIZE = 38;

// Y-shift to visually center the wordmark when the logo is invisible during bigText.
// Group layout: logo 180 px + gap 22 px + text ~60 px = 262 px tall.
// Text center is 232 px from group top → 101 px below group center → needs -101 px shift.
const TEXT_INTRO_SHIFT_Y = 101; // px

// Scale for "Budger" text in bigText phase (matches the video scene value)
const TEXT_INTRO_SCALE = 1.9375;

type AnimStep = "sniff" | "lick" | "idle";
type Phase    = "bigText" | "shrinkText" | "showing" | "moving" | "fading" | "vanishing";
type Dest     = "home" | "login" | null;

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
  const scale = srcRect && srcRect.height > 0
    ? Math.round((destRect.height / srcRect.height) * 1000) / 1000
    : Math.round((48 / WORDMARK_SIZE) * 1000) / 1000;
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

// ── Polling helper ────────────────────────────────────────────────────────────
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
    if (attempts >= 60) { onReady(el ? measure(el, srcEl) : null); return; }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  return () => { cancelled = true; };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashScreen({
  onDone,
  onNavigate,
  onFading,
}: {
  onDone: (dest: "home" | "login" | "vanish") => void;
  /** Called as soon as the exit destination is known, BEFORE polling for DOM
   *  markers.  Use this to mount the destination page proactively so the
   *  markers exist by the time the polls fire. */
  onNavigate?: (dest: "home" | "login") => void;
  /** Called the instant the splash starts its opacity-fade (t=1050ms after
   *  seqDone).  Use this to make destination-page content visible so it fades
   *  in simultaneously with the splash fading out — a seamless crossfade. */
  onFading?: () => void;
}) {
  // Intro + exit phase
  const [phase, setPhase] = useState<Phase>("bigText");

  // Face animation sequence
  const [animStep,  setAnimStep]  = useState<AnimStep>("idle");
  const [animDurMs, setAnimDurMs] = useState<number>(SNIFF_MS);
  const [seqDone,   setSeqDone]   = useState(false);

  // Exit-glide state — logo
  const [dest,      setDest]      = useState<Dest>(null);
  const [translate, setTranslate] = useState<string>("none");
  const [scale,     setScale]     = useState<number>(1);

  // Exit-glide state — wordmark
  const [wordmarkTranslate, setWordmarkTranslate] = useState<string>("none");
  const [wordmarkScale,     setWordmarkScale]     = useState<number>(1);
  const [wordmarkFound,     setWordmarkFound]     = useState(false);

  const logoRef     = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);

  const resolvedRef = useRef(false);

  // ── Prefetch state ────────────────────────────────────────────────────────
  const queryClient      = useQueryClient();
  const [pulseComplete, setPulseComplete] = useState(false);
  const [readinessProgress, setReadinessProgress] = useState(0);
  const [readinessVisualFloor, setReadinessVisualFloor] = useState(0);
  const [readinessWidth, setReadinessWidth] = useState<number | null>(null);
  const [readinessIndicatorVisible, setReadinessIndicatorVisible] = useState(false);
  const [readinessIndicatorEntered, setReadinessIndicatorEntered] = useState(false);
  const [readinessComplete, setReadinessComplete] = useState(false);
  const [readinessIndicatorFaded, setReadinessIndicatorFaded] = useState(false);
  const readinessProgressRef = useRef(0);
  const displayedReadinessProgress =
    readinessProgress > READINESS_FAKE_PERCENT
      ? readinessProgress
      : readinessVisualFloor;
  const prefetchFiredRef  = useRef(false);   // prevent double-firing wave 1
  const sniffFiredRef     = useRef(false);   // prevent double-firing sniff
  const startupRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect URL at mount to determine the correct exit behaviour.
  // Must run synchronously at mount so the exit effect always sees a stable value.
  // ‣ /invite/:token       — invite decision page: logo can't fly to home nav;
  //                          vanish in-place (scale+fade to zero, then overlay out).
  // ‣ /invite/:token/signup — signup flow: markers exist in the "name" step;
  //                          force "login" target regardless of auth state.
  const urlMode = useMemo<"vanish" | "force-login" | "normal">(() => {
    const p = window.location.pathname;
    if (/\/invite\/[^/]+\/signup/.test(p)) return "force-login";
    if (/\/invite\//.test(p)) return "vanish";
    return "normal";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Intro animation sequence ──────────────────────────────────────────────
  // Only drives the intro phase transitions (bigText → shrinkText → showing).
  // Sniff / lick / settle are now data-gated — see effects below.
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];
    ids.push(setTimeout(() => setPhase("shrinkText"), INTRO_BIG_MS));
    ids.push(setTimeout(() => setPhase("showing"),    FLOAT_START_MS));
    return () => ids.forEach(clearTimeout);
  }, []);

  // ── Startup prefetch: load the destination underneath the whole intro ────
  // This deliberately starts at mount rather than waiting for "showing".
  // The banner and logo transition are visual cover for this request wave.
  useEffect(() => {
    if (prefetchFiredRef.current) return;
    prefetchFiredRef.current    = true;
    let cancelled = false;
    async function loadStartupData() {
      let retryDelay = 350;
      while (!cancelled) {
        try {
          await prefetchHomeData(queryClient, (percent) => {
            if (!cancelled) {
              const nextProgress = Math.max(readinessProgressRef.current, percent);
              readinessProgressRef.current = nextProgress;
              setReadinessProgress((current) => Math.max(current, nextProgress));
            }
          });
          if (!cancelled) setReadinessComplete(true);
          return;
        } catch {
          // Keep the pulsing logo and last completed readiness percentage
          // visible while retrying, rather than exposing AuthGuard's spinner.
          await new Promise<void>((resolve) => {
            startupRetryTimerRef.current = setTimeout(resolve, retryDelay);
          });
          retryDelay = Math.min(retryDelay * 2, 2_000);
        }
      }
    }
    void loadStartupData();
    return () => {
      cancelled = true;
      if (startupRetryTimerRef.current) clearTimeout(startupRetryTimerRef.current);
    };
  // queryClient is the stable module-level instance; excluding from deps is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preserve one complete still-faced pulse before any facial animation.
  useEffect(() => {
    if (phase !== "showing") return;
    const id = setTimeout(() => setPulseComplete(true), PULSE_CYCLE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Don't show a possibly distracting progress bar during the first five
  // seconds of the pulsing logo. If readiness finishes first, keep it hidden.
  useEffect(() => {
    if (phase !== "showing") return;
    const id = setTimeout(() => {
      if (readinessProgressRef.current < 100) {
        setReadinessIndicatorVisible(true);
      }
    }, READINESS_APPEAR_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Mount at zero opacity, then let the CSS transition fade the indicator in.
  useEffect(() => {
    if (!readinessIndicatorVisible) return;
    const frame = requestAnimationFrame(() => setReadinessIndicatorEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [readinessIndicatorVisible]);

  // If real readiness is still at or below 17% two seconds after the indicator
  // appears, use a small visual floor to show activity. Real progress always
  // wins as soon as it passes 17%; the accessible value remains truthful.
  useEffect(() => {
    if (!readinessIndicatorVisible) return;
    setReadinessVisualFloor(0);
    const id = setTimeout(() => {
      if (readinessProgressRef.current <= READINESS_FAKE_PERCENT) {
        setReadinessVisualFloor(READINESS_FAKE_PERCENT);
      }
    }, READINESS_FAKE_DELAY_MS);
    return () => clearTimeout(id);
  }, [readinessIndicatorVisible]);

  // Match the readiness stripe to the "Budget Planner" tagline. Re-measure
  // when its font or the viewport shifts.
  useEffect(() => {
    if (phase !== "showing") return;
    const tagline = wordmarkRef.current?.querySelector<HTMLElement>(
      "[data-budger-wordmark-tagline]",
    );
    if (!tagline) return;

    const measure = () => setReadinessWidth(tagline.offsetWidth);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(tagline);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [phase]);

  // ── Fade the readiness indicator when all critical data is ready ─────────
  useEffect(() => {
    if (phase !== "showing" || readinessProgress < 100) return;
    const id = setTimeout(() => setReadinessIndicatorFaded(true), READINESS_FADE_MS);
    return () => clearTimeout(id);
  }, [phase, readinessProgress]);

  // ── Facial animation starts after readiness and one full still-faced pulse ─
  useEffect(() => {
    if (
      phase !== "showing" ||
      !pulseComplete ||
      !readinessComplete ||
      !readinessIndicatorFaded ||
      sniffFiredRef.current
    ) return;

    sniffFiredRef.current = true;
    setAnimStep("sniff");
    setAnimDurMs(SNIFF_MS);
    const ids: ReturnType<typeof setTimeout>[] = [];
    ids.push(setTimeout(() => setAnimStep("idle"), SNIFF_MS));
    ids.push(setTimeout(() => {
      setAnimStep("lick");
      setAnimDurMs(LICK_MS);
    }, SNIFF_MS + GAP_MS));
    ids.push(setTimeout(() => {
      setAnimStep("idle");
      setSeqDone(true);
    }, SNIFF_MS + GAP_MS + LICK_MS + SETTLE_MS));
    return () => ids.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pulseComplete, readinessComplete, readinessIndicatorFaded]);

  // ── Exit glide ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seqDone || resolvedRef.current) return;
    resolvedRef.current = true;

    // ── Vanish mode: invite URLs where the landing page isn't the home tab ──
    // Logo + wordmark shrink/fade in place, then the overlay fades out.
    if (urlMode === "vanish") {
      setPhase("vanishing");
      const t1 = setTimeout(() => setPhase("fading"), 320);
      const t2 = setTimeout(() => onDone("vanish"), 580);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    // "force-login": InviteSignup always has login markers in its "name" step —
    // use them regardless of whether a different user happens to be signed in.
    // Startup prefetch continues underneath the animation. If /me is still
    // pending, use the local session hint and let AuthGuard resolve it after
    // navigation; a confirmed 401 still sends the user to login.
    const prefs = loadPrefs();
    const requiresLogin = !prefs.staySignedIn && !hasActiveSession();
    const meState = queryClient.getQueryState(getGetMeQueryKey());
    const meRejected = (meState?.error as any)?.status === 401;
    const hasSession = !requiresLogin && !meRejected;
    const target: "home" | "login" =
      urlMode === "force-login"
        ? "login"
        : (hasSession ? "home" : "login");

    setDest(target);

    // ── Navigate early — before polls fire ───────────────────────────────────
    // Calling onNavigate here (before the poll timer) ensures the destination
    // page is mounted and its DOM markers are at their resting positions by the
    // time we start measuring.  This is critical on slow backends: if /api/me
    // is still loading, AuthGuard shows a spinner instead of LoginPage, so the
    // [data-splash-logo-login] and [data-splash-wordmark-login] markers don't
    // exist yet.  Navigating now mounts LoginPage immediately (it's outside
    // AuthGuard) so the polls always find stable, un-animated markers.
    onNavigate?.(target);

    let cancelled = false;
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    let logoT:     LogoTransform | null = null;
    let wordmarkT: LogoTransform | null = null;
    const needed = target === "login" ? 2 : 1;
    let resolved = 0;
    let logoResolved = false;
    let wordmarkResolved = false;

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

      setPhase("moving");
      t1 = setTimeout(() => { setPhase("fading"); onFading?.(); }, 1050);
      t2 = setTimeout(() => onDone(target),                       1400);
    }

    function resolveLogo(transform: LogoTransform | null) {
      if (logoResolved) return;
      logoResolved = true;
      logoT = transform ?? fallbackTransform(target);
      onAllReady();
    }

    function resolveWordmark(transform: LogoTransform | null) {
      if (wordmarkResolved) return;
      wordmarkResolved = true;
      // If a viewport resize prevents the login marker from stabilising, keep
      // the wordmark visible and let the overlay fade cover the small landing
      // difference instead of leaving the splash on a black screen.
      wordmarkT = transform ?? { translate: "translateY(-12vh)", scale: 48 / WORDMARK_SIZE };
      onAllReady();
    }

    // ── Startup delay before polling ─────────────────────────────────────────
    // Give the router one tick to commit the navigation and mount the
    // destination page before we start measuring DOM markers.  Without this,
    // on very fast devices the polls can start before AuthGuard's navigate()
    // effect has committed a React render, meaning the destination markers
    // aren't in the DOM yet and we burn 20 attempts on a blank query.
    // Login gets a longer delay (200 ms) because onNavigate mounts LoginPage
    // synchronously but React needs a full paint cycle to measure stable rects.
    let cancelLogo:     (() => void) | null = null;
    let cancelWordmark: (() => void) | null = null;
    const pollStartId = setTimeout(() => {
      if (cancelled) return;

      cancelLogo = pollForTransform(
        target === "home" ? "[data-splash-logo-home]" : "[data-splash-logo-login]",
        measureLogoTarget,
        resolveLogo,
        logoRef.current,
      );

      if (target === "login") {
        cancelWordmark = pollForTransform(
          "[data-splash-wordmark-login]",
          measureWordmarkTarget,
          resolveWordmark,
          wordmarkRef.current,
        );
      }
    }, target === "login" ? 200 : 80);
    const measureTimeoutId = setTimeout(() => {
      if (cancelled) return;
      // Resolve any marker that is still moving or unavailable after a
      // resize/reposition. The splash must always have a terminal visual path.
      if (!logoResolved) {
        cancelLogo?.();
        resolveLogo(null);
      }
      if (target === "login" && !wordmarkResolved) {
        cancelWordmark?.();
        resolveWordmark(null);
      }
    }, (target === "login" ? 200 : 80) + EXIT_MEASURE_TIMEOUT_MS);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    // IMPORTANT: do NOT cancel t2 (the onDone timer) here.
    //
    // This effect has `user` and `onDone` in its dep array so ESLint is happy,
    // but that means React can re-run it (and fire this cleanup) if either
    // reference changes — e.g. React Query refetches useGetMe mid-animation
    // on iOS focus, or the parent re-renders creating a new onDone reference.
    // When that happens while the 1.4 s animation is in flight, cancelling t2
    // prevents onDone from ever firing → splashDone stays false → black screen.
    //
    // resolvedRef.current ensures the logic block only executes once, so t2 is
    // only ever set once. It is safe to let it fire even if the effect re-runs.
    return () => {
      cancelled = true;
      clearTimeout(pollStartId);
      cancelLogo?.();
      cancelWordmark?.();
      clearTimeout(t1);
      clearTimeout(measureTimeoutId);
      // t2 (onDone) intentionally NOT cancelled — see comment above.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seqDone, urlMode]); // user + onDone omitted: resolvedRef guards re-entry; cancelling t2 on re-run caused black screen

  // ── Derived state ─────────────────────────────────────────────────────────
  const isBigText    = phase === "bigText";
  const isShrinkText = phase === "shrinkText";
  const isIntro      = isBigText || isShrinkText;
  const isMoving     = phase === "moving" || phase === "fading";
  const isFading     = phase === "fading";
  const wordmarkFlying = isMoving && dest === "login" && wordmarkFound;

  const forceAnim      = animStep !== "idle" ? animStep : null;
  const forceAnimDurMs = forceAnim != null ? animDurMs : undefined;

  // ── Intro styles ──────────────────────────────────────────────────────────
  // Logo: invisible+tiny in bigText, fades/scales in during shrinkText
  const logoIntroStyle: React.CSSProperties = isIntro ? {
    opacity:          isBigText ? 0 : 1,
    transform:        isBigText ? "scale(0.05)" : "scale(1)",
    transition:       isShrinkText
      ? `opacity ${INTRO_TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1), transform ${INTRO_TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1)`
      : "none",
    transformOrigin:  "center center",
  } : {};

  // Text: shifted up and scaled in bigText, transitions back during shrinkText.
  // translateY(-Y) scale(S) applies: first scale around center, then shift up.
  const textIntroStyle: React.CSSProperties = isIntro ? {
    transform:        isBigText
      ? `translateY(-${TEXT_INTRO_SHIFT_Y}px) scale(${TEXT_INTRO_SCALE})`
      : "translateY(0px) scale(1)",
    transition:       isShrinkText
      ? `transform ${INTRO_TRANSITION_MS}ms cubic-bezier(0.4,0,0.2,1)`
      : "none",
    transformOrigin:  "center center",
  } : {};

  return (
    <div
      className="splash-screen"
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         9999,
        background:     "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        paddingTop:     "env(safe-area-inset-top)",
        paddingBottom:  "env(safe-area-inset-bottom)",
        opacity:        isFading ? 0 : 1,
        transition:     isFading ? "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
        pointerEvents:  isMoving ? "none" : "auto",
      }}
    >
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            22,
        }}
      >
        {/* ── Logo ────────────────────────────────────────────────────────── */}
        {/* Outer: glide-to-destination translate / vanish shrink */}
        <div
          ref={logoRef}
          style={{
            transform:  phase === "vanishing" ? "scale(0)" : (isMoving ? translate : "none"),
            transition: phase === "vanishing"
              ? "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.32s ease"
              : (isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none"),
            opacity:    phase === "vanishing" ? 0 : 1,
            willChange: "transform",
            lineHeight: 0,
          }}
        >
          {/* Mid: glide-to-destination scale */}
          <div
            style={{
              transform:       isMoving ? `scale(${scale})` : "none",
              transition:      isMoving ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
              willChange:      "transform",
              transformOrigin: "center center",
              lineHeight:      0,
            }}
          >
            {/* Inner: intro fade-in/scale-up layer */}
            <div style={logoIntroStyle}>
              {/* Keep the body pulse running through sniff→lick; the first full
                  cycle completes before the facial sequence starts. */}
              <div className={phase === "showing" ? "splash-intro-pulse" : ""}>
                <BadgerLogo
                  size={SPLASH_SIZE}
                  forceAnim={forceAnim}
                  forceAnimDurationMs={forceAnimDurMs}
                  pauseIdleAnimations
                  growPulse={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Wordmark ─────────────────────────────────────────────────────── */}
        {/* Outer: glide-to-destination translate */}
        <div
          ref={wordmarkRef}
          style={{
            transform:  wordmarkFlying ? wordmarkTranslate : "none",
            transition: wordmarkFlying ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            willChange: wordmarkFlying ? "transform" : "auto",
            pointerEvents: "none",
          }}
        >
          {/* Mid: glide-to-destination scale */}
          <div
            style={{
              transform:       wordmarkFlying ? `scale(${wordmarkScale})` : "none",
              transition:      wordmarkFlying ? "transform 1.24s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
              willChange:      wordmarkFlying ? "transform" : "auto",
              transformOrigin: "center center",
            }}
          >
            {/* Inner: intro scale-down/shift-down layer */}
            <div style={textIntroStyle}>
              <BudgerWordmark
                size={WORDMARK_SIZE}
                tagline="Budget Planner"
                style={{
                  // Flying to login: always visible (overlay fade handles disappearance)
                  // Going to home or degraded: fade out when movement starts.
                  // filter:opacity() sidesteps the iOS Safari gradient-clip compositing bug
                  // where parent opacity fails to cascade through -webkit-background-clip:text.
                  filter: phase === "vanishing"
                    ? "opacity(0%)"
                    : (wordmarkFlying
                      ? "none"
                      : (phase === "showing" || isIntro ? "none" : "opacity(0%)")),
                  transition: phase === "vanishing"
                    ? "filter 0.32s ease"
                    : (wordmarkFlying ? "none" : "filter 0.15s linear"),
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {phase === "showing" &&
        readinessIndicatorVisible &&
        !readinessIndicatorFaded &&
        !sniffFiredRef.current && (
          <div
            className={`splash-readiness${readinessIndicatorEntered ? " is-entered" : ""}${readinessProgress >= 100 ? " is-complete" : ""}`}
            role="progressbar"
            aria-label="App readiness"
            aria-busy={readinessProgress < 100}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={readinessProgress}
            aria-valuetext={`${Math.round(readinessProgress)}% ready`}
            style={readinessWidth ? { width: `${readinessWidth}px` } : undefined}
          >
            <div className="splash-readiness-track" aria-hidden="true">
              <div
                className="splash-readiness-fill"
                style={{ width: `${displayedReadinessProgress}%` }}
              />
            </div>
            <div className="splash-readiness-percent" aria-hidden="true">
              {Math.round(displayedReadinessProgress)}%
            </div>
          </div>
      )}
    </div>
  );
}
