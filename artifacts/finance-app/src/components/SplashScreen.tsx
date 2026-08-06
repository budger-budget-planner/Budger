import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@/lib/api-client";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";
import { prefetchHomeData, prefetchHouseholdData } from "@/lib/prefetch";

// ── Intro phase timing ────────────────────────────────────────────────────────
// Phase 1 "bigText"  : large wordmark centered, logo invisible (holds 700 ms)
// Phase 2 "shrinkText": logo fades/scales in, wordmark contracts (CSS 800 ms transition)
// Phase 3 "showing"  : normal float — logo 120 px, wordmark 38 px
const INTRO_BIG_MS         = 1200;  // how long bigText holds
const INTRO_TRANSITION_MS  = 800;   // CSS transition duration for shrinkText
const FLOAT_START_MS       = INTRO_BIG_MS + INTRO_TRANSITION_MS; // 2 000 ms

// ── Float sequence timing (absolute from mount) ───────────────────────────────
// sniff at 2× speed → lick at 2.25× speed → glide to destination
const SNIFF_MS  = Math.round(1400 / 2);    //  700 ms (2× speed)
const LICK_MS   = Math.round(2400 / 2.25); // 1 067 ms (2.25× speed)
const SETTLE_MS = 200;
const GAP_MS    = 100;

const T_SNIFF_START = FLOAT_START_MS + 2000;         // 4 000 ms — one full 2 s pulse before sniff
const T_SNIFF_END   = T_SNIFF_START + SNIFF_MS;      // 2 400 ms
const T_LICK_START  = T_SNIFF_END + GAP_MS;          // 2 500 ms
const T_LICK_END    = T_LICK_START + LICK_MS;        // 3 567 ms
const T_SEQ_DONE    = T_LICK_END + SETTLE_MS;        // 3 767 ms

// ── Prefetch timing ───────────────────────────────────────────────────────────
// Logo pulses for at least MIN_PULSE_MS before sniff fires (even if data loads fast).
// If data takes longer, sniff waits. MAX_PULSE_MS is a hard cap so the splash
// never hangs indefinitely on very slow or offline connections.
const MIN_PULSE_MS = 2000; // minimum pulse duration before sniff (ms from float start)
const MAX_PULSE_MS = 8000; // safety cap: sniff fires regardless after this

// ── Sizes ─────────────────────────────────────────────────────────────────────
const SPLASH_SIZE = 120; // px — must match <BadgerLogo size={SPLASH_SIZE} />

// Wordmark in float state: 38 px (matches BudgerWordmark default).
// Login destination: 48 px (BudgerWordmark size={48} in Login.tsx).
// Scale factor: 48/38 = 1.263 — used as fallback if DOM measurement fails.
const WORDMARK_SIZE = 38;

// Y-shift to visually center the wordmark when the logo is invisible during bigText.
// Group layout: logo 120 px + gap 22 px + text ~60 px = 202 px tall.
// Text center is 172 px from group top → 71 px below group center → needs -71 px shift.
const TEXT_INTRO_SHIFT_Y = 71; // px

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

  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // ── Prefetch state ────────────────────────────────────────────────────────
  const queryClient      = useQueryClient();
  const [dataReady, setDataReady] = useState(false);
  const prefetchFiredRef  = useRef(false);   // prevent double-firing wave 1
  const sniffFiredRef     = useRef(false);   // prevent double-firing sniff
  const floatStartedAtRef = useRef<number | null>(null); // records when "showing" began

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

  // ── Wave 1 prefetch: fire all home-page queries as soon as logo pulses ────
  useEffect(() => {
    if (phase !== "showing" || prefetchFiredRef.current) return;
    prefetchFiredRef.current    = true;
    floatStartedAtRef.current   = Date.now();
    let cancelled = false;
    prefetchHomeData(queryClient).then(() => {
      if (!cancelled) setDataReady(true);
    });
    return () => { cancelled = true; };
  // queryClient is the stable module-level instance; excluding from deps is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Wave 2 prefetch: household members, once /me resolves ────────────────
  useEffect(() => {
    if (isLoading || !user) return;
    prefetchHouseholdData(queryClient, (user as any).householdId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  // ── Sniff trigger: fires when data is ready + min pulse time has elapsed ──
  useEffect(() => {
    if (!dataReady || sniffFiredRef.current) return;
    const elapsed = floatStartedAtRef.current != null
      ? Date.now() - floatStartedAtRef.current
      : MIN_PULSE_MS;
    const wait = Math.max(0, MIN_PULSE_MS - elapsed);
    const fire = () => {
      if (sniffFiredRef.current) return;
      sniffFiredRef.current = true;
      setAnimStep("sniff");
      setAnimDurMs(SNIFF_MS);
      // Lick and settle are relative to the moment sniff fires.
      setTimeout(() => setAnimStep("idle"),                               SNIFF_MS);
      setTimeout(() => { setAnimStep("lick"); setAnimDurMs(LICK_MS); },  SNIFF_MS + GAP_MS);
      setTimeout(() => { setAnimStep("idle"); setSeqDone(true); },        SNIFF_MS + GAP_MS + LICK_MS + SETTLE_MS);
    };
    const id = setTimeout(fire, wait);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  // ── Safety cap: force sniff after MAX_PULSE_MS on very slow networks ──────
  useEffect(() => {
    if (phase !== "showing") return;
    const id = setTimeout(() => {
      if (sniffFiredRef.current) return;
      setDataReady(true); // also unblocks exit-glide condition
      sniffFiredRef.current = true;
      setAnimStep("sniff");
      setAnimDurMs(SNIFF_MS);
      setTimeout(() => setAnimStep("idle"),                               SNIFF_MS);
      setTimeout(() => { setAnimStep("lick"); setAnimDurMs(LICK_MS); },  SNIFF_MS + GAP_MS);
      setTimeout(() => { setAnimStep("idle"); setSeqDone(true); },        SNIFF_MS + GAP_MS + LICK_MS + SETTLE_MS);
    }, MAX_PULSE_MS);
    return () => clearTimeout(id);
  // phase transitions once (bigText→shrinkText→showing); only "showing" triggers the cap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── isLoading safety cap: give /api/me at most 5 s after seqDone ─────────
  useEffect(() => {
    if (!seqDone || !isLoading) return;
    const id = setTimeout(() => setLoadingTimedOut(true), 5000);
    return () => clearTimeout(id);
  }, [seqDone, isLoading]);

  // ── Exit glide ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seqDone || (isLoading && !loadingTimedOut) || resolvedRef.current) return;
    resolvedRef.current = true;

    // ── Vanish mode: invite URLs where the landing page isn't the home tab ──
    // Logo + wordmark shrink/fade in place, then the overlay fades out.
    if (urlMode === "vanish") {
      setPhase("vanishing");
      const t1 = setTimeout(() => setPhase("fading"), 320);
      const t2 = setTimeout(() => onDone("vanish"), 580);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    const prefs  = loadPrefs();
    // "force-login": InviteSignup always has login markers in its "name" step —
    // use them regardless of whether a different user happens to be signed in.
    const target: "home" | "login" =
      urlMode === "force-login"
        ? "login"
        : (user != null && (prefs.staySignedIn || hasActiveSession()) ? "home" : "login");

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
        (t) => { logoT = t ?? fallbackTransform(target); onAllReady(); },
        logoRef.current,
      );

      if (target === "login") {
        cancelWordmark = pollForTransform(
          "[data-splash-wordmark-login]",
          measureWordmarkTarget,
          (t) => { wordmarkT = t; onAllReady(); },
          wordmarkRef.current,
        );
      }
    }, target === "login" ? 200 : 80);

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
              {/* Pulse: breathe animation during float */}
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
    </div>
  );
}
