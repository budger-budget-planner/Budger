import { useState, useEffect, useRef } from "react";

type Anim = "wink" | "sniff" | "lick" | null;
export type BadgerMode = "awake" | "falling-asleep" | "sleeping" | "waking-up";

const ANIM_MS: Record<NonNullable<Anim>, number> = {
  wink: 490,
  sniff: 1400,
  lick: 2400,
};

const LOGO_SRC = "/badger-logo.png";
const WINK_BASE_SRC = "/badger-logo-no-right-eye.png";
const RIGHT_EYE_SRC = "/badger-right-eye.png";
const NOSE_SRC = "/badger-nose-isolated.png";
const NOSE_COVER_SRC = "/badger-nose-cover.png";
// The supplied artwork is intentionally kept at its native aspect ratio.
const LOGO_ASPECT = 2048 / 2386;

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

  const displayAnim = mode === "awake" ? (forceAnim ?? anim) : null;
  const faceClass =
    mode !== "awake"
      ? `blg-${mode}`
      : displayAnim
        ? `blg-${displayAnim}`
        : "blg-idle";

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

  // `size` remains the width used by splash measurement and destination
  // matching. The height follows the supplied image rather than cropping it.
  const logoStyle = {
    "--blg-size": `${size}px`,
    ...(forceAnimDurationMs != null
      ? { "--blg-anim-dur": `${forceAnimDurationMs}ms` }
      : {}),
    width: size,
    height: size * LOGO_ASPECT,
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
        <span className={`blg-face ${faceClass}`}>
          <img
            className="blg-face-image"
            src={LOGO_SRC}
            alt=""
            draggable={false}
          />
          <img
            className="blg-wink-base-image"
            src={WINK_BASE_SRC}
            alt=""
            draggable={false}
          />

          {/* These layers are positioned against the supplied artwork itself,
              so the existing personality animations act on the new face. */}
          <span className="blg-eye-cover blg-eye-cover-left" aria-hidden="true" />
          <span className="blg-eye-cover blg-eye-cover-right" aria-hidden="true" />
          <span className="blg-eye-overlay blg-eye-overlay-right" aria-hidden="true">
            <img
              className="blg-eye-overlay-image"
              src={RIGHT_EYE_SRC}
              alt=""
              draggable={false}
            />
          </span>
          <span className="blg-nose-cover" aria-hidden="true">
            <img
              className="blg-nose-cover-image"
              src={NOSE_COVER_SRC}
              alt=""
              draggable={false}
            />
          </span>
          <span className="blg-nose-overlay" aria-hidden="true">
            <img
              className="blg-nose-overlay-image"
              src={NOSE_SRC}
              alt=""
              draggable={false}
            />
          </span>
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
          /* Contain is intentional: the supplied cheek silhouettes must
             remain exactly as delivered and never be cropped by a wrapper. */
          object-fit: contain;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }

        .badger-logo .blg-wink-base-image {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          opacity: 0;
          user-select: none;
          pointer-events: none;
        }

        /*
         * During a wink, keep the original face mounted and stationary.
         * The no-right-eye artwork is only a small cleanup patch inside the
         * eye socket. Swapping the complete alternate image here makes its
         * independently edited ear, cheek, stripe, and muzzle geometry jump
         * as soon as the wink starts.
         */
        .blg-wink .blg-wink-base-image {
          opacity: 1;
        }
        .blg-wink-base-image {
          /*
           * The source patch is deliberately clipped to the eye socket.
           * Outside this ellipse the original face is always the only
           * visible artwork, so the head cannot change during the wink.
           */
          clip-path: ellipse(10.7% 12.5% at 69.5% 47.8%);
        }

        .blg-eye-cover {
          position: absolute;
          top: 37.4%;
          width: 17.6%;
          height: 20.5%;
          border-radius: 50%;
          background: #141413;
          opacity: 0;
          pointer-events: none;
          z-index: 2;
          clip-path: ellipse(50% 50% at 50% 50%);
        }
        .blg-eye-cover-left { left: 20.6%; }
        .blg-eye-cover-right { left: 61.8%; }

        .blg-eye-overlay {
          position: absolute;
          top: 37.4%;
          width: 17.6%;
          height: 20.5%;
          overflow: hidden;
          opacity: 0;
          transform-origin: center;
          pointer-events: none;
          z-index: 3;
          clip-path: ellipse(50% 50% at 50% 50%);
        }
        .blg-eye-overlay-right {
          left: 58.8%;
          top: 35.3%;
          width: 21.4%;
          height: 25%;
          overflow: hidden;
          clip-path: none;
          transform-origin: 50% 53.5%;
        }
        .blg-eye-overlay-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }

        .blg-eye-cover::after {
          content: "";
          position: absolute;
          left: 15%;
          top: 49%;
          width: 70%;
          height: max(1px, calc(var(--blg-size) * 0.012));
          border-radius: 999px;
          background: #aaa7a0;
          opacity: 0;
          transform: scaleX(0.15);
          transform-origin: center;
        }

        .blg-wink .blg-eye-cover-right {
          animation: blg-wink-mask var(--blg-anim-dur, 0.49s) ease-in-out forwards;
          transform: none;
        }
        .blg-wink .blg-eye-cover-right::after {
          display: none;
        }

        .blg-wink .blg-eye-overlay-right {
          animation: blg-wink-eye var(--blg-anim-dur, 0.49s) ease-in-out forwards;
        }
        .blg-wink .blg-eye-cover-right {
          animation: none;
          opacity: 0;
        }

        @keyframes blg-wink-mask {
          0%, 100% { opacity: 0; }
          8%, 92% { opacity: 1; }
        }

        @keyframes blg-wink-eye {
          0%, 8% {
            opacity: 1;
            transform: scaleY(1);
          }
          12% {
            opacity: 1;
            transform: scaleY(1);
          }
          28% {
            opacity: 1;
            transform: scaleY(0.68);
          }
          45% {
            opacity: 1;
            transform: scaleY(0.24);
          }
          55%, 66% {
            opacity: 1;
            transform: scaleY(0.06);
          }
          82% {
            opacity: 1;
            transform: scaleY(0.36);
          }
          92%, 100% {
            opacity: 1;
            transform: scaleY(1);
          }
        }

        /* Used only by the offline waking state. The wink never uses this
           pseudo-element; it compresses the real eye artwork instead. */
        @keyframes blg-wink-line {
          0%, 28% { opacity: 0; transform: scaleX(0.15); }
          40%, 82% { opacity: 1; transform: scaleX(1); }
          92%, 100% { opacity: 0; transform: scaleX(0.15); }
        }

        /* During sniff, the supplied artwork's original nose is covered by a
           pixel-accurate transparent-mask asset. It covers only the dark nose
           silhouette, leaving the smile and muzzle completely stationary. */
        .blg-nose-cover {
          position: absolute;
          left: 41.65%;
          top: 61.33%;
          width: 16.76%;
          height: 15.38%;
          opacity: 0;
          pointer-events: none;
          z-index: 1;
        }
        .blg-nose-cover-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }
        .blg-sniff .blg-nose-cover {
          opacity: 1;
        }

        /* This is a transparent crop of the supplied artwork's original nose.
           Only this exact crop moves; no replacement shape is drawn in CSS. */
        .blg-nose-overlay {
          position: absolute;
          left: 41.65%;
          top: 61.33%;
          width: 16.76%;
          height: 15.38%;
          opacity: 0;
          pointer-events: none;
          z-index: 2;
        }
        .blg-nose-overlay-image {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }
        .blg-sniff .blg-nose-overlay {
          animation: blg-sniff-nose var(--blg-anim-dur, 1.4s) ease-in-out forwards;
        }
        @keyframes blg-sniff-nose {
          0%, 15%   { opacity: 1; transform: translateY(0); }
          30%       { opacity: 1; transform: translateY(-3.5px); }
          45%       { opacity: 1; transform: translateY(0); }
          60%       { opacity: 1; transform: translateY(-3.5px); }
          75%, 100% { opacity: 1; transform: translateY(0); }
        }

        /* The new artwork has a smile but no separate tongue node. This
           overlay gives the existing lick animation a real visible target. */
        .blg-tongue {
          position: absolute;
          left: 50%;
          top: 73%;
          width: 13%;
          height: 11%;
          border-radius: 50% 50% 48% 48%;
          background: linear-gradient(180deg, #f080a2 0%, #d95379 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
          opacity: 0;
          transform: translate(-50%, -10%) scaleY(0.1);
          transform-origin: center top;
          pointer-events: none;
        }
        .blg-lick .blg-tongue {
          animation: blg-tongue-lick var(--blg-anim-dur, 2.4s) ease-in-out forwards;
        }
        @keyframes blg-tongue-lick {
          0%, 7%    { opacity: 0; transform: translate(-50%, -10%) scaleY(0.1); }
          15%       { opacity: 0.95; transform: translate(-50%, 0) scaleY(1); }
          27%       {
            opacity: 0.95;
            transform: translate(-50%, 2px) translateX(calc(var(--blg-size) * -0.12))
              scaleX(0.75) scaleY(0.9) rotate(-14deg);
          }
          58%       {
            opacity: 0.9;
            transform: translate(-50%, 2px) translateX(calc(var(--blg-size) * 0.12))
              scaleX(0.75) scaleY(0.9) rotate(14deg);
          }
          78%       { opacity: 0.9; transform: translate(-50%, 0) scaleY(1); }
          90%, 100% { opacity: 0; transform: translate(-50%, -12%) scaleY(0.1); }
        }

        /* Offline sleep state: close the eyes over the supplied illustration,
           then use the same overlays for the sleeping and waking states. */
        .blg-falling-asleep .blg-eye-cover-left,
        .blg-falling-asleep .blg-eye-cover-right {
          animation: blg-eye-close 1.6s ease-in-out forwards;
        }
        .blg-falling-asleep .blg-eye-cover-right {
          animation-delay: 0.15s;
        }
        .blg-falling-asleep .blg-eye-cover::after {
          opacity: 1;
          transform: scaleX(1);
        }
        @keyframes blg-eye-close {
          0%   { opacity: 0; transform: scaleY(0.1); }
          35%  { opacity: 0.7; transform: scaleY(0.55); }
          70%  { opacity: 1; transform: scaleY(1); }
          100% { opacity: 1; transform: scaleY(1); }
        }

        .blg-sleeping {
          animation: blg-breathe 3.5s ease-in-out infinite;
        }
        .blg-sleeping .blg-eye-cover {
          opacity: 1;
          transform: scaleY(1);
        }
        .blg-sleeping .blg-eye-cover::after {
          opacity: 1;
          transform: scaleX(1);
        }
        .blg-sleeping .blg-face-image {
          filter: brightness(0.72);
        }
        @keyframes blg-breathe {
          0%, 100% { transform: translateY(0); }
          35%, 65% { transform: translateY(-1.4px); }
        }

        .blg-waking-up .blg-eye-cover-left,
        .blg-waking-up .blg-eye-cover-right {
          opacity: 1;
          animation: blg-eye-wake 2.5s ease-in-out forwards;
        }
        .blg-waking-up .blg-eye-cover::after {
          opacity: 1;
          animation: blg-wink-line 2.5s ease-in-out forwards;
        }
        @keyframes blg-eye-wake {
          0%   { opacity: 1; transform: scaleY(1); }
          36%  { opacity: 0.85; transform: scaleY(0.5); }
          53%  { opacity: 1; transform: scaleY(1); }
          76%  { opacity: 0.4; transform: scaleY(0.2); }
          86%  { opacity: 0.15; transform: scaleY(0.08); }
          100% { opacity: 0; transform: scaleY(0.05); }
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
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
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