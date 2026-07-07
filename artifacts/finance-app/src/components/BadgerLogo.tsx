import { useState, useEffect, useId, useRef } from "react";

type Anim = "wink" | "sniff" | "lick" | null;
export type BadgerMode = "awake" | "falling-asleep" | "sleeping" | "waking-up";

const ANIM_MS: Record<NonNullable<Anim>, number> = {
  wink: 700,
  sniff: 1400,
  lick: 2400,
};

interface BadgerLogoProps {
  size?: number;
  /** Override the internally-scheduled animation (e.g. for splash-screen wink). */
  forceAnim?: NonNullable<Anim> | null;
  /**
   * Override the CSS animation duration (in ms) for the forced animation.
   * Only used when `forceAnim` is set — the internal idle-interval animations
   * always play at their default speeds so regular app behaviour is unchanged.
   */
  forceAnimDurationMs?: number;
  /**
   * Sleep-state machine driven by the caller (Layout) based on network status.
   *   "awake"         — normal idle with wink/sniff/lick animations
   *   "falling-asleep"— transition: both eyes slowly close (≈1.4 s)
   *   "sleeping"      — looping: eyes closed, chest breathing, Zzz rising
   *   "waking-up"     — transition: eyes flutter open (≈1.0 s)
   */
  mode?: BadgerMode;
}

export default function BadgerLogo({
  size = 40,
  forceAnim,
  forceAnimDurationMs,
  mode = "awake",
}: BadgerLogoProps) {
  const uid = useId().replace(/:/g, "");
  const [anim, setAnim] = useState<Anim>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const resetRef       = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAnimRef    = useRef<NonNullable<Anim> | null>(null);
  const consecutiveRef = useRef(0);
  // Track mode in a ref so the interval callback always sees the latest value
  const modeRef = useRef<BadgerMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Suspend idle personality animations while the badger is asleep
      if (modeRef.current !== "awake") return;

      const all: NonNullable<Anim>[] = ["wink", "sniff", "lick"];
      const filtered = consecutiveRef.current >= 2
        ? all.filter(c => c !== lastAnimRef.current)
        : all;
      const pool   = filtered.length > 0 ? filtered : all;
      const chosen = pool[Math.floor(Math.random() * pool.length)];

      if (chosen === lastAnimRef.current) {
        consecutiveRef.current += 1;
      } else {
        lastAnimRef.current    = chosen;
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

  // forceAnim (e.g. splash screen) takes precedence, but only in awake mode
  const displayAnim = mode === "awake" ? (forceAnim ?? anim) : null;

  // Root group class: sleep-state classes take over from personality animations
  const grp = mode !== "awake"
    ? `blg-${mode}`
    : (displayAnim ? `blg-${displayAnim}` : "blg-idle");

  const svgStyle = forceAnimDurationMs != null
    ? ({ "--blg-anim-dur": `${forceAnimDurationMs}ms` } as React.CSSProperties)
    : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Budger badger logo"
      style={svgStyle}
    >
      <defs>
        <linearGradient
          id={`bgBorderGrad-${uid}`}
          x1="50" y1="0" x2="50" y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="#999" />
          <stop offset="55%"  stopColor="#505050" />
          <stop offset="100%" stopColor="#2a2a2a" />
        </linearGradient>

        <style>{`
          /* ── shared transform setup ── */
          .blg-eye-l, .blg-eye-r, .blg-nose, .blg-tongue {
            transform-box: fill-box;
            transform-origin: center;
          }

          /* ══ Animation 1: WINK (right eye only) ══ */
          .blg-wink .blg-eye-r {
            animation: blg-wink var(--blg-anim-dur, 0.7s) ease-in-out forwards;
          }
          @keyframes blg-wink {
            0%   { transform: scaleY(1); }
            15%  { transform: scaleY(0.06); }
            52%  { transform: scaleY(0.06); }
            72%  { transform: scaleY(1.1); }
            85%  { transform: scaleY(0.95); }
            100% { transform: scaleY(1); }
          }

          /* ══ Animation 2: SNIFF (nose lifts) ══ */
          .blg-sniff .blg-nose {
            animation: blg-sniff var(--blg-anim-dur, 1.4s) ease-in-out forwards;
          }
          @keyframes blg-sniff {
            0%   { transform: translateY(0px)    scaleX(1); }
            15%  { transform: translateY(-3.5px) scaleX(1.09); }
            30%  { transform: translateY(0px)    scaleX(1); }
            45%  { transform: translateY(-3.5px) scaleX(1.09); }
            60%  { transform: translateY(0px)    scaleX(1); }
            75%  { transform: translateY(-3.5px) scaleX(1.09); }
            90%  { transform: translateY(0px)    scaleX(1); }
            100% { transform: translateY(0px)    scaleX(1); }
          }

          /* ══ Animation 3: LICK (tongue sweeps) ══ */
          .blg-tongue { opacity: 0; }
          .blg-lick .blg-tongue {
            animation: blg-lick var(--blg-anim-dur, 2.4s) ease-in-out forwards;
          }
          @keyframes blg-lick {
            0%   { opacity: 0; transform: scaleY(0.1) translateY(0px); }
            7%   { opacity: 1; transform: scaleY(1)   translateY(0px); }
            27%  { opacity: 1; transform: scaleX(0.75) scaleY(0.9) translateX(-10px) translateY(2px) rotate(-14deg); }
            58%  { opacity: 1; transform: scaleX(0.75) scaleY(0.9) translateX(10px)  translateY(2px) rotate(14deg); }
            78%  { opacity: 1; transform: scaleY(1) translateX(0) translateY(0); }
            90%  { opacity: 0; transform: scaleY(0.1) translateY(-2px); }
            100% { opacity: 0; }
          }

          /* ══ FALLING ASLEEP — both eyes close slowly ══ */
          .blg-falling-asleep .blg-eye-l {
            animation: blg-eye-close 1.3s ease-in-out forwards;
          }
          .blg-falling-asleep .blg-eye-r {
            animation: blg-eye-close 1.3s ease-in-out forwards 0.18s;
          }
          @keyframes blg-eye-close {
            0%   { transform: scaleY(1); }
            30%  { transform: scaleY(0.65); }
            60%  { transform: scaleY(0.22); }
            85%  { transform: scaleY(0.08); }
            100% { transform: scaleY(0.06); }
          }

          /* ══ SLEEPING — eyes stay closed, whole group breathes ══ */
          .blg-sleeping .blg-eye-l,
          .blg-sleeping .blg-eye-r {
            transform: scaleY(0.06);
          }
          /* Gentle breathing: the animated group as a whole rises and falls */
          .blg-sleeping {
            animation: blg-breathe 3.5s ease-in-out infinite;
          }
          @keyframes blg-breathe {
            0%, 100% { transform: translateY(0px); }
            35%      { transform: translateY(-1.4px); }
            65%      { transform: translateY(-1.4px); }
          }

          /* Zzz — hidden by default, animated only when sleeping */
          .blg-zzz {
            opacity: 0;
            transform-box: fill-box;
            transform-origin: center;
          }
          /* Every-other-breath: 7 s cycle (two 3.5 s breaths).
             First ≈ 3.5 s = active (rise + fade), last ≈ 3.5 s = dead silence. */
          .blg-sleeping .blg-z1 {
            animation: blg-zzz-rise 7s ease-in-out infinite 0.35s;
          }
          .blg-sleeping .blg-z2 {
            animation: blg-zzz-rise 7s ease-in-out infinite 1.0s;
          }
          .blg-sleeping .blg-z3 {
            animation: blg-zzz-rise 7s ease-in-out infinite 1.65s;
          }
          @keyframes blg-zzz-rise {
            0%   { opacity: 0; transform: translate(0px, 0px); }
            8%   { opacity: 0.95; }
            46%  { opacity: 0.75; transform: translate(9px, -19px); }
            56%  { opacity: 0;    transform: translate(11px, -23px); }
            100% { opacity: 0;    transform: translate(11px, -23px); }
          }

          /* ══ WAKING UP — eyes flutter open from closed ══ */
          .blg-waking-up .blg-eye-l,
          .blg-waking-up .blg-eye-r {
            animation: blg-eye-open 0.95s ease-out forwards;
          }
          @keyframes blg-eye-open {
            0%   { transform: scaleY(0.06); }
            42%  { transform: scaleY(1.18); }
            65%  { transform: scaleY(0.80); }
            83%  { transform: scaleY(1.09); }
            100% { transform: scaleY(1); }
          }
        `}</style>
      </defs>

      {/* ── Background ── */}
      <rect width="100" height="100" rx="22" fill="#111" />
      <rect x="1" y="1" width="98" height="98" rx="21.5" fill="none"
        stroke={`url(#bgBorderGrad-${uid})`} strokeWidth="1.5" />

      {/* ── Static structural layers ── */}
      {/* Head */}
      <ellipse cx="50" cy="52" rx="42" ry="34" fill="#F0EDE6" />

      {/* Ears */}
      <ellipse cx="19" cy="24" rx="12" ry="11" fill="#777" />
      <ellipse cx="81" cy="24" rx="12" ry="11" fill="#777" />
      <ellipse cx="19" cy="25" rx="7"  ry="6.5" fill="#aaa" />
      <ellipse cx="81" cy="25" rx="7"  ry="6.5" fill="#aaa" />

      {/* Black face stripes */}
      <path d="M 33 74 Q 24 60 20 46 Q 17 33 20 22" stroke="#111" strokeWidth="27" strokeLinecap="round" fill="none" />
      <path d="M 67 74 Q 76 60 80 46 Q 83 33 80 22" stroke="#111" strokeWidth="27" strokeLinecap="round" fill="none" />

      {/* White centre stripe */}
      <ellipse cx="50" cy="40" rx="10" ry="18" fill="#F0EDE6" />

      {/* Cheek puffs */}
      <ellipse cx="10" cy="52" rx="13" ry="19" fill="#F0EDE6" />
      <ellipse cx="90" cy="52" rx="13" ry="19" fill="#F0EDE6" />

      {/* Lower muzzle */}
      <ellipse cx="50" cy="70" rx="20" ry="14" fill="#E8E4DC" />

      {/* ── Animated group — class drives which child (and itself) animates ── */}
      <g className={grp}>

        {/* Left eye — SLEEP + WAKE target */}
        <g className="blg-eye-l">
          <circle cx="29" cy="48" r="10.5" fill="white" />
          <circle cx="30" cy="49" r="7"    fill="#0d0d0d" />
          <circle cx="32.5" cy="47" r="2.5" fill="white" />
        </g>

        {/* Right eye — WINK + SLEEP + WAKE target */}
        <g className="blg-eye-r">
          <circle cx="71" cy="48" r="10.5" fill="white" />
          <circle cx="70" cy="49" r="7"    fill="#0d0d0d" />
          <circle cx="72.5" cy="47" r="2.5" fill="white" />
        </g>

        {/* Nose — SNIFF target */}
        <g className="blg-nose">
          <ellipse cx="50" cy="67" rx="9"   ry="7"   fill="#111" />
          <ellipse cx="47" cy="65" rx="3"   ry="2.2" fill="#2a2a2a" />
        </g>

        {/* Smile */}
        <path
          d="M 41 73 Q 50 81 59 73"
          stroke="#999"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Tongue — LICK target (hidden by default via CSS) */}
        <g className="blg-tongue">
          <ellipse cx="50" cy="79.5" rx="6.5" ry="5"   fill="#e8608a" />
          <ellipse cx="50" cy="76.5" rx="4"   ry="2.8" fill="#e8608a" />
          <line
            x1="50" y1="75.5" x2="50" y2="83.5"
            stroke="#c0406a" strokeWidth="1" strokeLinecap="round" opacity="0.55"
          />
          <ellipse cx="48" cy="77.5" rx="1.8" ry="1" fill="white" opacity="0.3" />
        </g>

        {/* ── Zzz — sleeping exhale bubbles ──
             Three white Z letters rising from the right side of the mouth
             upper-right toward the dark face stripe, staggered 0.65 s each.
             They are hidden via opacity:0 (blg-zzz) and only animated
             when the parent group carries the blg-sleeping class.          */}
        <text
          aria-hidden="true"
          className="blg-zzz blg-z1"
          x="61" y="71"
          fontSize="6.5"
          fontWeight="800"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >Z</text>
        <text
          aria-hidden="true"
          className="blg-zzz blg-z2"
          x="67" y="63"
          fontSize="9"
          fontWeight="800"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >Z</text>
        <text
          aria-hidden="true"
          className="blg-zzz blg-z3"
          x="74" y="54"
          fontSize="12"
          fontWeight="800"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >Z</text>
      </g>
    </svg>
  );
}
