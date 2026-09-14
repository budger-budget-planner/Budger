import { useState, useEffect, useRef } from "react";

type Anim = "wink" | "sniff" | "lick" | null;
export type BadgerMode = "awake" | "falling-asleep" | "sleeping" | "waking-up";

const ANIM_MS: Record<NonNullable<Anim>, number> = {
  wink: 700,
  sniff: 1400,
  lick: 2400,
};

const LOGO_SRC = "/badger-logo.png";

interface BadgerLogoProps {
  size?: number;
  /** Override the internally-scheduled animation (e.g. for splash-screen wink). */
  forceAnim?: NonNullable<Anim> | null;
  /**
   * Override the CSS animation duration (in ms) for the forced animation.
   * Only used when forceAnim is set — the internal idle-interval animations
   * always play at their default speeds so regular app behaviour is unchanged.
   */
  forceAnimDurationMs?: number;
  /**
   * Sleep-state machine driven by the caller (Layout) based on network status.
   *   "awake"         — normal idle with wink/sniff/lick animations
   *   "falling-asleep"— transition into the offline sleep state
   *   "sleeping"      — looping: gentle breathing and Zzz rising
   *   "waking-up"     — transition back to the awake state
   */
  mode?: BadgerMode;
  /**
   * When true, suppresses the internal random idle animations (wink/sniff/lick)
   * so the caller has full control over what plays. forceAnim still works.
   */
  pauseIdleAnimations?: boolean;
  /**
   * Whole-icon "coming alive" grow pulse that plays alongside personality/
   * sleep-transition animations. Only wanted for the in-app logo (header,
   * login screen) — splash screens set this to false since the logo there
   * is already scaling/flying as part of the glide-to-destination sequence.
   */
  growPulse?: boolean;
}

export default function BadgerLogo({
  size = 40,
  forceAnim,
  forceAnimDurationMs,
  mode = "awake",
  pauseIdleAnimations = false,
  growPulse = true,
}: BadgerLogoProps) {
  const [anim, setAnim] = useState<Anim>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAnimRef = useRef<NonNullable<Anim> | null>(null);
  const consecutiveRef = useRef(0);
  const modeRef = useRef<BadgerMode>(mode);
  const pauseRef = useRef(pauseIdleAnimations);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    pauseRef.current = pauseIdleAnimations;
  }, [pauseIdleAnimations]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (modeRef.current !== "awake" || pauseRef.current) return;

      const all: NonNullable<Anim>[] = ["wink", "sniff", "lick"];
      const filtered =
        consecutiveRef.current >= 2
          ? all.filter((candidate) => candidate !== lastAnimRef.current)
          : all;
      const pool = filtered.length > 0 ? filtered : all;
      const chosen = pool[Math.floor(Math.random() * pool.length)];

      if (chosen === lastAnimRef.current) {
        consecutiveRef.current += 1;
      } else {
        lastAnimRef.current = chosen;
        consecutiveRef.current = 1;
      }

      setAnim(chosen);
      clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setAnim(null), ANIM_MS[chosen] + 150);
    }, 10_000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(resetRef.current);
    };
  }, []);

  // A forced splash animation takes precedence over the idle timer.
  const displayAnim = mode === "awake" ? (forceAnim ?? anim) : null;
  const faceClass =
    mode !== "awake"
      ? `blg-${mode}`
      : displayAnim
        ? `blg-${displayAnim}`
        : "blg-idle";

  const animationStyle =
    forceAnimDurationMs != null
      ? ({ "--blg-anim-dur": `${forceAnimDurationMs}ms` } as React.CSSProperties)
      : undefined;

  // Keep the pulse on a separate layer from face motion. This prevents the
  // grow animation from competing with the splash translate/scale wrappers.
  const growDurMs =
    mode === "falling-asleep"
      ? 1600
      : mode === "waking-up"
        ? 2500
        : displayAnim === "wink"
          ? (forceAnimDurationMs ?? ANIM_MS.wink) + 260
          : displayAnim
            ? (forceAnimDurationMs ?? ANIM_MS[displayAnim])
            : undefined;
  const growActive = growPulse && growDurMs != null;
  const growAnimName =
    displayAnim === "wink"
      ? "blg-grow-wink"
      : displayAnim === "lick"
        ? "blg-grow-lick"
        : "blg-grow";

  const logoStyle = {
    "--blg-size": `${size}px`,
    width: size,
    height: size,
  } as React.CSSProperties;

  const growStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    transformOrigin: "center",
    ...(growActive ? { animation: `${growAnimName} ${growDurMs}ms ease-in-out` } : {}),
  };

  return (
    <span
      className="badger-logo"
      style={logoStyle}
      role="img"
      aria-label="Budger badger logo"
    >
      <span className="blg-grow-layer" style={growStyle}>
        <span className={`blg-face ${faceClass}`} style={animationStyle}>
          <img
            className="blg-face-image"
            src={LOGO_SRC}
            alt=""
            draggable={false}
          />

          {/* The supplied artwork is a single image, so the tongue and sleep
              marks remain separate animated overlays rather than being baked
              into a second, non-animated logo. */}
          <span className="blg-tongue" aria-hidden="true" />
          <span className="blg-zzz blg-z1" aria-hidden="true">
            z
          </span>
          <span className="blg-zzz blg-z2" aria-hidden="true">
            z
          </span>
          <span className="blg-zzz blg-z3" aria-hidden="true">
            Z
          </span>
        </span>
      </span>

      <style>{`
        .badger-logo {
          display: inline-block;
          position: relative;
          flex: 0 0 auto;
          line-height: 0;
          overflow: visible;
          vertical-align: middle;
        }

        .badger-logo .blg-grow-layer,
        .badger-logo .blg-face {
          display: block;
          position: relative;
        }

        .badger-logo .blg-face {
          width: 100%;
          height: 100%;
          transform-origin: center;
        }

        .badger-logo .blg-face-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }

        /* The raster artwork cannot animate individual SVG nodes, so these
           motions preserve the original personality without distorting the
           new illustration or interrupting splash translations. */
        .blg-wink .blg-face-image {
          animation: blg-image-wink var(--blg-anim-dur, 0.7s) ease-in-out forwards;
        }
        @keyframes blg-image-wink {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15%      { transform: scale(0.99, 0.96) rotate(-1.2deg); }
          52%      { transform: scale(0.99, 0.96) rotate(-1.2deg); }
          72%      { transform: scale(1.015, 1.04) rotate(0.8deg); }
          85%      { transform: scale(0.997, 0.99) rotate(-0.25deg); }
        }

        .blg-sniff .blg-face-image {
          animation: blg-image-sniff var(--blg-anim-dur, 1.4s) ease-in-out forwards;
        }
        @keyframes blg-image-sniff {
          0%, 100% { transform: translateY(0) scale(1); }
          15%, 45%, 75% { transform: translateY(-2px) scale(1.018, 1.01); }
          30%, 60%, 90% { transform: translateY(0) scale(1); }
        }

        .blg-tongue {
          position: absolute;
          left: 50%;
          top: 74%;
          width: 13%;
          height: 10%;
          border-radius: 50% 50% 48% 48%;
          background: linear-gradient(180deg, #f080a2 0%, #d95379 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
          opacity: 0;
          transform: translate(-50%, -10%) scaleY(0.1);
          transform-origin: center top;
          pointer-events: none;
        }
        .blg-lick .blg-face-image {
          animation: blg-image-lick var(--blg-anim-dur, 2.4s) ease-in-out forwards;
        }
        .blg-lick .blg-tongue {
          animation: blg-tongue-lick var(--blg-anim-dur, 2.4s) ease-in-out forwards;
        }
        @keyframes blg-image-lick {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          28%      { transform: translateY(1px) rotate(-0.8deg); }
          58%      { transform: translateY(1px) rotate(0.8deg); }
          80%      { transform: translateY(0) rotate(0deg); }
        }
        @keyframes blg-tongue-lick {
          0%, 7%   { opacity: 0; transform: translate(-50%, -10%) scaleY(0.1); }
          15%, 78% { opacity: 0.95; transform: translate(-50%, 0) scaleY(1); }
          90%, 100% { opacity: 0; transform: translate(-50%, -12%) scaleY(0.1); }
        }

        .blg-falling-asleep .blg-face-image {
          animation: blg-image-fall-asleep 1.6s ease-in-out forwards;
        }
        @keyframes blg-image-fall-asleep {
          0%   { transform: scale(1); filter: brightness(1); }
          45%  { transform: scale(0.985) translateY(1px); filter: brightness(0.88); }
          100% { transform: scale(0.97) translateY(1px); filter: brightness(0.72); }
        }

        .blg-sleeping {
          animation: blg-breathe 3.5s ease-in-out infinite;
        }
        .blg-sleeping .blg-face-image {
          filter: brightness(0.72);
        }
        @keyframes blg-breathe {
          0%, 100% { transform: translateY(0); }
          35%, 65% { transform: translateY(-1.4px); }
        }

        .blg-waking-up .blg-face-image {
          animation: blg-image-wake 2.5s ease-in-out forwards;
        }
        @keyframes blg-image-wake {
          0%   { transform: scale(0.97) translateY(1px); filter: brightness(0.72); }
          36%  { transform: scale(0.99) translateY(0); filter: brightness(0.86); }
          53%  { transform: scale(0.97) translateY(1px); filter: brightness(0.75); }
          76%  { transform: scale(1.018) translateY(0); filter: brightness(1.04); }
          86%  { transform: scale(0.99); filter: brightness(0.96); }
          100% { transform: scale(1); filter: brightness(1); }
        }

        .blg-zzz {
          position: absolute;
          z-index: 2;
          color: white;
          font-family: Inter, system-ui, sans-serif;
          font-size: calc(var(--blg-size) * 0.26);
          font-style: italic;
          font-weight: 800;
          line-height: 1;
          opacity: 0;
          pointer-events: none;
          text-shadow: 0 1px 2px rgba(0,0,0,0.45);
        }
        .blg-z1 { left: 58%; top: 24%; }
        .blg-z2 { left: 68%; top: 9%; font-size: calc(var(--blg-size) * 0.35); }
        .blg-z3 { left: 79%; top: -7%; font-size: calc(var(--blg-size) * 0.44); }
        .blg-sleeping .blg-z1 { animation: blg-zzz-rise 7s ease-in-out infinite 0.35s; }
        .blg-sleeping .blg-z2 { animation: blg-zzz-rise 7s ease-in-out infinite 1s; }
        .blg-sleeping .blg-z3 { animation: blg-zzz-rise 7s ease-in-out infinite 1.65s; }
        @keyframes blg-zzz-rise {
          0%   { opacity: 0; transform: translate(0, 0); }
          8%   { opacity: 1; }
          46%  { opacity: 0.85; transform: translate(10px, -20px); }
          56%, 100% { opacity: 0; transform: translate(12px, -25px); }
        }

        @keyframes blg-grow {
          0%   { transform: scale(1); }
          15%  { transform: scale(1.05); }
          85%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes blg-grow-wink {
          0%   { transform: scale(1); }
          22%  { transform: scale(1.05); }
          80%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes blg-grow-lick {
          0%   { transform: scale(1); }
          10%  { transform: scale(1.05); }
          65%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </span>
  );
}