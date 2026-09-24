import { useState, useEffect, useRef } from "react";

type Anim = "wink" | "sniff" | "lick" | "happy" | null;
export type BadgerMode = "awake" | "falling-asleep" | "sleeping" | "waking-up";

const ANIM_MS: Record<NonNullable<Anim>, number> = {
  wink: 490,
  sniff: 1400,
  lick: 2400,
  happy: 1800,
};

const BASE_SRC = "/animation/base_no_eyes_no_mouth_no_nose.png";
const LEFT_EYE_SRC = "/animation/base_left_eye.png";
const RIGHT_EYE_SRC = "/animation/base_right_eye.png";
const MOUTH_SRC = "/animation/base_mouth.png";
const NOSE_SRC = "/animation/base_nose.png";
// The no-eyes/no-mouth/no-nose artwork is the stationary square face for every state.
const LOGO_ASPECT = 1;

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
   *   "awake"         — normal idle with wink/sniff/lick/happy animations
   *   "falling-asleep"— transition into the offline sleep state
   *   "sleeping"      — looping: gentle breathing and Zzz rising
   *   "waking-up"     — transition back to the awake state
   */
  mode?: BadgerMode;
  /**
   * When true, suppresses the internal random idle animations (wink/sniff/lick/happy)
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

      const all: NonNullable<Anim>[] = ["wink", "sniff", "lick", "happy"];
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

  // `size` is both dimensions of the canonical square face. Keeping one
  // square base mounted prevents any face geometry from changing mid-animation.
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
            src={BASE_SRC}
            alt=""
            draggable={false}
          />

          {/* The face never changes. Features are independent layers so each
              animation can move only the artwork it owns. */}
          <span className="blg-eye-overlay blg-eye-overlay-left" aria-hidden="true">
            <img
              className="blg-eye-overlay-image"
              src={LEFT_EYE_SRC}
              alt=""
              draggable={false}
            />
          </span>
          <span className="blg-eye-overlay blg-eye-overlay-right" aria-hidden="true">
            <img
              className="blg-eye-overlay-image"
              src={RIGHT_EYE_SRC}
              alt=""
              draggable={false}
            />
          </span>
          <span className="blg-happy-eye blg-happy-eye-left" aria-hidden="true">
            <span className="blg-happy-eye-highlight blg-happy-eye-highlight-large" />
            <span className="blg-happy-eye-highlight blg-happy-eye-highlight-small" />
          </span>
          <span className="blg-happy-eye blg-happy-eye-right" aria-hidden="true">
            <span className="blg-happy-eye-highlight blg-happy-eye-highlight-large" />
            <span className="blg-happy-eye-highlight blg-happy-eye-highlight-small" />
          </span>
          <span className="blg-happy-cheek blg-happy-cheek-left" aria-hidden="true" />
          <span className="blg-happy-cheek blg-happy-cheek-right" aria-hidden="true" />
          <span className="blg-mouth-overlay" aria-hidden="true">
            <img
              className="blg-mouth-overlay-image"
              src={MOUTH_SRC}
              alt=""
              draggable={false}
            />
          </span>
          <span className="blg-happy-mouth" aria-hidden="true">
            <span className="blg-happy-mouth-teeth" />
            <span className="blg-happy-mouth-tongue" />
          </span>
          <span className="blg-sleep-line blg-sleep-line-left" aria-hidden="true" />
          <span className="blg-sleep-line blg-sleep-line-right" aria-hidden="true" />
          <span className="blg-yawn" aria-hidden="true">
            <span className="blg-yawn-cavity" />
            <span className="blg-yawn-teeth" />
            <span className="blg-yawn-tongue" />
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
          object-fit: fill;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }

        .blg-eye-overlay {
          position: absolute;
          left: 18.75%;
          top: 34.277%;
          width: 22.607%;
          height: 22.607%;
          overflow: hidden;
          opacity: 1;
          transform-origin: center;
          pointer-events: none;
          z-index: 3;
          clip-path: none;
        }
        .blg-eye-overlay-right {
          left: 58.643%;
          top: 34.277%;
          width: 22.607%;
          height: 22.607%;
          overflow: hidden;
          clip-path: none;
          transform-origin: 50% 50%;
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

        /*
         * Kawaii happy eyes are drawn as a separate layer because the normal
         * eye crops include a white sclera. Two highlights keep the large
         * black eyes readable at the small in-app logo sizes.
         */
        .blg-happy-eye {
          position: absolute;
          top: 34.277%;
          width: 22.607%;
          height: 22.607%;
          border-radius: 50%;
          background: #101010;
          box-shadow: inset 0 -1px 1px rgba(255, 255, 255, 0.08);
          opacity: 0;
          transform: scale(0.72);
          transform-origin: center;
          pointer-events: none;
          z-index: 3;
        }
        .blg-happy-eye-left { left: 18.75%; }
        .blg-happy-eye-right { left: 58.643%; }
        .blg-happy-eye-highlight {
          position: absolute;
          border-radius: 50%;
          background: #fff;
          pointer-events: none;
        }
        .blg-happy-eye-highlight-large {
          top: 17%;
          right: 17%;
          width: 28%;
          height: 28%;
        }
        .blg-happy-eye-highlight-small {
          left: 19%;
          bottom: 19%;
          width: 20%;
          height: 20%;
        }
        .blg-happy-cheek {
          position: absolute;
          top: 55.5%;
          width: 13.5%;
          height: 8.5%;
          border-radius: 50%;
          background: rgba(240, 119, 161, 0.86);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.16);
          opacity: 0;
          transform: scale(0.7);
          pointer-events: none;
          z-index: 3;
        }
        .blg-happy-cheek-left {
          left: 14.5%;
          transform: rotate(-18deg) scale(0.7);
        }
        .blg-happy-cheek-right {
          left: 72%;
          transform: rotate(18deg) scale(0.7);
        }

        .blg-sleep-line {
          position: absolute;
          top: 45.1%;
          width: 12.7%;
          height: max(1px, calc(var(--blg-size) * 0.012));
          border-radius: 999px;
          background: #686761;
          opacity: 0;
          transform: scaleX(0.7);
          transform-origin: center;
          pointer-events: none;
          z-index: 4;
        }
        /* Center each replacement line on the eye it inherits from. */
        .blg-sleep-line-left { left: 23.7%; }
        .blg-sleep-line-right { left: 63.6%; }

        /*
         * The yawn is a small, lower open-mouth shape inside the muzzle. It is
         * deliberately narrower than the smile and sits below the nose, so it
         * reads as a yawn rather than a second horizontal mouth attached to it.
         */
        .blg-yawn {
          position: absolute;
          left: 50%;
          top: 72.1%;
          width: 19.5%;
          height: 12.8%;
          opacity: 0;
          transform: translate(-50%, 0) scaleY(0);
          transform-origin: 50% 0%;
          pointer-events: none;
          z-index: 3;
        }
        .blg-yawn-cavity {
          position: absolute;
          inset: 0;
          border-radius: 48% 48% 50% 50%;
          background: #1a1a1a;
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.1),
            0 1px 1px rgba(0, 0, 0, 0.12);
        }
        .blg-yawn-teeth {
          position: absolute;
          left: 17%;
          top: 8%;
          width: 66%;
          height: 15%;
          border-radius: 50%;
          background: #eeeae2;
          opacity: 0.92;
        }
        .blg-yawn-tongue {
          position: absolute;
          left: 21%;
          bottom: 6%;
          width: 58%;
          height: 37%;
          border-radius: 50% 50% 46% 46%;
          background: linear-gradient(180deg, #ed7899 0%, #c94c70 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        /*
         * The wink leaves the canonical face and left eye untouched. Only the
         * independent right-eye layer compresses into a line and reopens.
         */
        .blg-wink .blg-eye-overlay-right {
          animation: blg-wink-eye var(--blg-anim-dur, 0.49s) ease-in-out forwards;
        }

        @keyframes blg-wink-eye {
          0%, 10% { opacity: 1; transform: scaleY(1); }
          30%     { opacity: 1; transform: scaleY(0.62); }
          46%     { opacity: 1; transform: scaleY(0.08); }
          62%     { opacity: 1; transform: scaleY(0.04); }
          78%     { opacity: 1; transform: scaleY(0.38); }
          92%     { opacity: 1; transform: scaleY(0.86); }
          100%    { opacity: 1; transform: scaleY(1); }
        }

        /*
         * The happy state swaps the normal feature crops for a short kawaii
         * expression, then fades back to the canonical face before reset.
         */
        .blg-happy .blg-eye-overlay,
        .blg-happy .blg-mouth-overlay {
          animation: blg-happy-normal-out var(--blg-anim-dur, 1.8s) ease-in-out forwards;
        }
        .blg-happy .blg-happy-eye {
          animation: blg-happy-eye-pop var(--blg-anim-dur, 1.8s) ease-in-out forwards;
        }
        .blg-happy .blg-happy-cheek {
          animation: blg-happy-cheek-pop var(--blg-anim-dur, 1.8s) ease-in-out forwards;
        }
        .blg-happy .blg-happy-mouth {
          animation: blg-happy-mouth-pop var(--blg-anim-dur, 1.8s) ease-in-out forwards;
        }
        @keyframes blg-happy-normal-out {
          0%, 8%   { opacity: 1; transform: scale(1); }
          18%      { opacity: 0; transform: scale(0.82); }
          100%     { opacity: 0; transform: scale(0.82); }
        }
        @keyframes blg-happy-eye-pop {
          0%, 10%  { opacity: 0; transform: scale(0.72); }
          24%      { opacity: 1; transform: scale(1.08); }
          34%, 78% { opacity: 1; transform: scale(1); }
          90%      { opacity: 0.8; transform: scale(0.9); }
          100%     { opacity: 0; transform: scale(0.72); }
        }
        @keyframes blg-happy-cheek-pop {
          0%, 12%  { opacity: 0; }
          25%      { opacity: 0.86; }
          78%      { opacity: 0.86; }
          100%     { opacity: 0; }
        }
        @keyframes blg-happy-mouth-pop {
          0%, 12%  { opacity: 0; transform: translateY(2px) scale(0.62, 0.3); }
          26%      { opacity: 1; transform: translateY(0) scale(1.06, 1); }
          36%, 78% { opacity: 1; transform: translateY(0) scale(1); }
          90%      { opacity: 0.75; transform: translateY(1px) scale(0.86, 0.78); }
          100%     { opacity: 0; transform: translateY(2px) scale(0.62, 0.3); }
        }

        /*
         * Offline transitions use the exact same vertical eye compression as
         * the wink. There are no eyelid shapes: the eye artwork disappears
         * into a small dark-grey line, then opens again from that line.
         */
        .blg-falling-asleep .blg-eye-overlay {
          opacity: 1;
          animation: blg-sleep-eye-close 1.1s ease-in-out 0.9s forwards;
        }
        .blg-falling-asleep .blg-sleep-line {
          animation: blg-sleep-line-in 1.1s ease-in-out 0.9s forwards;
        }
        .blg-falling-asleep .blg-yawn {
          animation: blg-yawn-open 1.1s ease-in-out 0.9s forwards;
        }
        /*
         * Replace the smile in two stages: it closes first, the yawn opens
         * from the lower muzzle, then the smile returns before the transition
         * enters the steady sleeping state.
         */
        .blg-falling-asleep .blg-mouth-overlay {
          animation: blg-smile-yawn-transition 1.1s ease-in-out 0.9s forwards;
        }
        @keyframes blg-yawn-open {
          0%, 14%   { opacity: 0; transform: translate(-50%, 0) scaleY(0); }
          24%       { opacity: 0.55; transform: translate(-50%, 0) scaleY(0.34); }
          38%, 68%  { opacity: 1; transform: translate(-50%, 0) scaleY(1); }
          80%       { opacity: 0.72; transform: translate(-50%, 0) scaleY(0.42); }
          92%, 100% { opacity: 0; transform: translate(-50%, 0) scaleY(0); }
        }
        @keyframes blg-smile-yawn-transition {
          0%, 10%   { opacity: 1; transform: translateY(0) scaleY(1); }
          24%       { opacity: 0.8; transform: translateY(0) scaleY(0.86); }
          38%, 68%  { opacity: 0; transform: translateY(0) scaleY(0.25); }
          82%       { opacity: 0.34; transform: translateY(0) scaleY(0.58); }
          94%       { opacity: 0.86; transform: translateY(0) scaleY(0.94); }
          100%      { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        @keyframes blg-sleep-eye-close {
          0%   { opacity: 1; transform: scaleY(1); }
          35%  { opacity: 1; transform: scaleY(0.68); }
          58%  { opacity: 0.98; transform: scaleY(0.32); }
          72%  { opacity: 0.72; transform: scaleY(0.14); }
          84%  { opacity: 0.2; transform: scaleY(0.06); }
          92%, 100% { opacity: 0; transform: scaleY(0.06); }
        }
        @keyframes blg-sleep-line-in {
          0%, 55% { opacity: 0; transform: scaleX(0.7); }
          68%     { opacity: 0.08; transform: scaleX(0.75); }
          78%     { opacity: 0.35; transform: scaleX(0.85); }
          88%     { opacity: 0.82; transform: scaleX(0.96); }
          94%, 100% { opacity: 1; transform: scaleX(1); }
        }

        .blg-sleeping .blg-eye-overlay {
          opacity: 0;
          transform: scaleY(0.06);
        }
        .blg-sleeping .blg-sleep-line {
          opacity: 1;
          transform: scaleX(1);
        }
        /*
         * The transition animation runs with forwards, so explicitly
         * restore the steady-state mouth when the mode changes. This prevents
         * the smile from remaining at opacity: 0 after the yawn closes.
         */
        .blg-sleeping .blg-mouth-overlay,
        .blg-waking-up .blg-mouth-overlay {
          opacity: 1;
          transform: none;
          animation: none;
        }
        .blg-sleeping .blg-yawn,
        .blg-waking-up .blg-yawn {
          opacity: 0;
          transform: translate(-50%, 0) scaleY(0);
          animation: none;
        }

        .blg-waking-up .blg-eye-overlay {
          opacity: 1;
          animation: blg-sleep-eye-open 2.5s ease-in-out forwards;
        }
        .blg-waking-up .blg-sleep-line {
          animation: blg-sleep-line-out 2.5s ease-in-out forwards;
        }
        @keyframes blg-sleep-eye-open {
          0%, 12% { opacity: 0; transform: scaleY(0.06); }
          28%     { opacity: 1; transform: scaleY(0.06); }
          58%     { opacity: 1; transform: scaleY(0.24); }
          78%     { opacity: 1; transform: scaleY(0.68); }
          100%    { opacity: 1; transform: scaleY(1); }
        }
        @keyframes blg-sleep-line-out {
          0%, 30% { opacity: 1; transform: scaleX(1); }
          72%     { opacity: 1; transform: scaleX(0.9); }
          100%    { opacity: 0; transform: scaleX(0.7); }
        }

        /*
         * The base face has no eyes, mouth, or nose. These exact feature crops
         * restore the still face at the canonical square-face coordinates.
         */
        .blg-mouth-overlay {
          position: absolute;
          left: 39.8%;
          top: 68.55%;
          width: 20.7%;
          height: 7.76%;
          opacity: 1;
          pointer-events: none;
          z-index: 2;
        }
        .blg-mouth-overlay-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          user-select: none;
          pointer-events: none;
        }

        .blg-happy-mouth {
          position: absolute;
          left: 38.25%;
          top: 72%;
          width: 23.5%;
          height: 11.5%;
          border-radius: 44% 44% 50% 50%;
          background: #151515;
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.1),
            0 1px 1px rgba(0, 0, 0, 0.14);
          opacity: 0;
          transform: translateY(2px) scale(0.62, 0.3);
          transform-origin: center top;
          pointer-events: none;
          z-index: 3;
        }
        .blg-happy-mouth-teeth {
          position: absolute;
          left: 16%;
          top: 7%;
          width: 68%;
          height: 18%;
          border-radius: 50%;
          background: #eeeae2;
          opacity: 0.94;
        }
        .blg-happy-mouth-tongue {
          position: absolute;
          left: 18%;
          bottom: 5%;
          width: 64%;
          height: 39%;
          border-radius: 50% 50% 46% 46%;
          background: linear-gradient(180deg, #f080a2 0%, #d95379 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
        }

        /* Only the isolated nose moves during sniff. The mouth and face stay
           still, so there is no replacement or cover layer to reveal. */
        .blg-nose-overlay {
          position: absolute;
          left: 41%;
          top: 57.2%;
          width: 18.28%;
          height: 14.66%;
          opacity: 1;
          pointer-events: none;
          z-index: 4;
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
          top: 73.5%;
          width: 12%;
          height: 9%;
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
            transform: translate(-50%, 1px) translateX(calc(var(--blg-size) * -0.075))
              scaleX(0.75) scaleY(0.9) rotate(-14deg);
          }
          58%       {
            opacity: 0.9;
            transform: translate(-50%, 1px) translateX(calc(var(--blg-size) * 0.075))
              scaleX(0.75) scaleY(0.9) rotate(14deg);
          }
          78%       { opacity: 0.9; transform: translate(-50%, 0) scaleY(1); }
          90%, 100% { opacity: 0; transform: translate(-50%, -12%) scaleY(0.1); }
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