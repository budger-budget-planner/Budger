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
  const uid = useId().replace(/:/g, "");
  const [anim, setAnim] = useState<Anim>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const resetRef       = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAnimRef    = useRef<NonNullable<Anim> | null>(null);
  const consecutiveRef = useRef(0);
  // Track mode and pauseIdleAnimations in refs so the interval callback always sees the latest value
  const modeRef  = useRef<BadgerMode>(mode);
  const pauseRef = useRef(pauseIdleAnimations);
  useEffect(() => { modeRef.current  = mode; },                [mode]);
  useEffect(() => { pauseRef.current = pauseIdleAnimations; }, [pauseIdleAnimations]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Suspend idle personality animations while asleep or caller has paused them
      if (modeRef.current !== "awake" || pauseRef.current) return;

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

  // "Coming alive" grow pulse — the whole icon gently swells just as a
  // personality (wink/sniff/lick) or sleep-transition (falling-asleep/
  // waking-up) animation kicks in, and eases back to normal once it's done.
  // Not applied to steady "sleeping" or plain "idle" — only transient states.
  const growDurMs =
    mode === "falling-asleep" ? 1600 :
    mode === "waking-up"      ? 2500 :
    displayAnim ? (forceAnimDurationMs ?? ANIM_MS[displayAnim]) :
    undefined;
  const growActive = growPulse && growDurMs != null;
  // Wink is quick, so let it hang onto the "grown" size a touch longer before
  // settling back — feels less snappy/abrupt for such a short animation.
  // Lick is the longest animation, so ease back down sooner — otherwise the
  // grow lingers noticeably after the tongue motion has already finished.
  const growAnimName =
    displayAnim === "wink" ? "blg-grow-wink" :
    displayAnim === "lick" ? "blg-grow-lick" :
    "blg-grow";
  const outerStyle: React.CSSProperties = {
    transformBox: "fill-box",
    transformOrigin: "center",
    ...(growActive ? { animation: `${growAnimName} ${growDurMs}ms ease-in-out` } : {}),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Budger badger logo"
      style={{ ...svgStyle, overflow: "visible" }}
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

          /* ── Yawn mouth — hidden by default ── */
          .blg-yawn {
            opacity: 0;
            transform-box: fill-box;
            transform-origin: center top; /* hinge at top of bounding box so mouth stays attached */
          }
          /* Smile hides while mouth is open during a yawn */
          .blg-falling-asleep .blg-smile,
          .blg-waking-up .blg-smile {
            animation: blg-smile-yawn 1.6s ease-in-out forwards;
          }
          @keyframes blg-smile-yawn {
            0%,  8%   { opacity: 1; }
            18%, 82%  { opacity: 0; }
            95%, 100% { opacity: 1; }
          }
          .blg-falling-asleep .blg-yawn {
            animation: blg-yawn-open 1.6s ease-in-out forwards;
          }
          .blg-waking-up .blg-yawn {
            animation: blg-yawn-open 1.4s ease-in-out forwards;
          }
          @keyframes blg-yawn-open {
            0%   { opacity: 0; transform: scaleY(0);    }
            12%  { opacity: 1; transform: scaleY(0.4);  }
            30%  { opacity: 1; transform: scaleY(1);    }
            65%  { opacity: 1; transform: scaleY(1);    }
            88%  { opacity: 0.7; transform: scaleY(0.15); }
            100% { opacity: 0; transform: scaleY(0);    }
          }

          /* ══ FALLING ASLEEP — both eyes close slowly, fading to grey ══ */
          .blg-falling-asleep .blg-eye-l {
            animation: blg-eye-close 1.4s ease-in-out forwards 0.3s;
          }
          .blg-falling-asleep .blg-eye-r {
            animation: blg-eye-close 1.4s ease-in-out forwards 0.5s;
          }
          @keyframes blg-eye-close {
            0%   { transform: scaleY(1);    opacity: 1;    }
            30%  { transform: scaleY(0.55); opacity: 0.75; }
            60%  { transform: scaleY(0.18); opacity: 0.45; }
            85%  { transform: scaleY(0.05); opacity: 0.25; }
            100% { transform: scaleY(0.04); opacity: 0.2;  }
          }

          /* Drawn closed eyelids (grey arc lines) — hidden by default */
          .blg-closed-eye-l,
          .blg-closed-eye-r { opacity: 0; }

          /* ══ SLEEPING ══ */
          /* Eyes stay visible as a faint grey sliver — not hidden, just dim */
          .blg-sleeping .blg-eye-l,
          .blg-sleeping .blg-eye-r {
            transform: scaleY(0.04);
            opacity: 0.2;
          }
          /* Grey eyelid arc lines sit on top of the faint sliver */
          .blg-sleeping .blg-closed-eye-l,
          .blg-sleeping .blg-closed-eye-r { opacity: 1; }
          /* Gentle breathing on the whole group */
          .blg-sleeping {
            animation: blg-breathe 3.5s ease-in-out infinite;
          }
          @keyframes blg-breathe {
            0%, 100% { transform: translateY(0px);   }
            35%      { transform: translateY(-1.4px); }
            65%      { transform: translateY(-1.4px); }
          }

          /* Zzz — hidden by default, animated only when sleeping          */
          .blg-zzz {
            opacity: 0;
            transform-box: fill-box;
            transform-origin: center;
          }
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
            0%   { opacity: 0;    transform: translate(0px,   0px);   }
            8%   { opacity: 1;                                         }
            46%  { opacity: 0.85; transform: translate(10px, -20px);  }
            56%  { opacity: 0;    transform: translate(12px, -25px);  }
            100% { opacity: 0;    transform: translate(12px, -25px);  }
          }

          /* ══ WAKING UP ══ */
          /* Grey arc lids fade out at the very start of waking */
          .blg-waking-up .blg-closed-eye-l,
          .blg-waking-up .blg-closed-eye-r {
            animation: blg-closed-fade 0.3s ease-out forwards;
          }
          @keyframes blg-closed-fade {
            from { opacity: 1; }
            to   { opacity: 0; }
          }
          /* Eyes: yawn → groggy half-open → droop → spring fully open   */
          .blg-waking-up .blg-eye-l,
          .blg-waking-up .blg-eye-r {
            animation: blg-eye-wake 2.5s ease-in-out forwards;
          }
          @keyframes blg-eye-wake {
            /* sleeping baseline */
            0%   { transform: scaleY(0.04); opacity: 0.2;  }
            /* hold while yawn is in full swing */
            20%  { transform: scaleY(0.04); opacity: 0.2;  }
            /* groggy half-open — still bleary */
            36%  { transform: scaleY(0.45); opacity: 0.6;  }
            /* droop back shut — too tired yet */
            53%  { transform: scaleY(0.04); opacity: 0.3;  }
            /* brief hold */
            61%  { transform: scaleY(0.04); opacity: 0.3;  }
            /* spring OPEN with overshoot bounce */
            76%  { transform: scaleY(1.18); opacity: 1;    }
            86%  { transform: scaleY(0.82); opacity: 1;    }
            93%  { transform: scaleY(1.08); opacity: 1;    }
            100% { transform: scaleY(1);    opacity: 1;    }
          }

          /* ══ "Coming alive" grow pulse — whole icon, transient states only ══ */
          @keyframes blg-grow {
            0%   { transform: scale(1);    }
            15%  { transform: scale(1.05); }
            85%  { transform: scale(1.05); }
            100% { transform: scale(1);    }
          }
          /* Wink: hold the grown size a little longer before settling back */
          @keyframes blg-grow-wink {
            0%   { transform: scale(1);    }
            15%  { transform: scale(1.05); }
            92%  { transform: scale(1.05); }
            100% { transform: scale(1);    }
          }
          /* Lick: ease back down sooner so it doesn't linger past the tongue motion */
          @keyframes blg-grow-lick {
            0%   { transform: scale(1);    }
            10%  { transform: scale(1.05); }
            65%  { transform: scale(1.05); }
            100% { transform: scale(1);    }
          }
        `}</style>
      </defs>

      <g style={outerStyle}>

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

        {/* ── Drawn closed eyelids — single cartoon line per eye ──
             Simple slightly-curved horizontal lines give a classic
             cartoon "asleep" look without full eyelid shapes.           */}
        <g className="blg-closed-eye-l">
          <path d="M 21 48 Q 29 45 37 48"
            stroke="#4a4a4a" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </g>
        <g className="blg-closed-eye-r">
          <path d="M 63 48 Q 71 45 79 48"
            stroke="#4a4a4a" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </g>

        {/* Nose — SNIFF target */}
        <g className="blg-nose">
          <ellipse cx="50" cy="67" rx="9"   ry="7"   fill="#111" />
          <ellipse cx="47" cy="65" rx="3"   ry="2.2" fill="#2a2a2a" />
        </g>

        {/* Smile — hidden during yawn via CSS */}
        <path
          className="blg-smile"
          d="M 41 73 Q 50 81 59 73"
          stroke="#999"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* ── Yawn mouth ─────────────────────────────────────────────────────
             Appears at the start of falling-asleep and waking-up. Scales
             downward from the top of the mouth opening (transform-origin set
             in CSS). The smile hides while this is visible.                */}
        <g className="blg-yawn">
          {/* Dark mouth cavity */}
          <ellipse cx="50" cy="77" rx="12" ry="8" fill="#1a1a1a" />
          {/* Upper teeth row */}
          <rect x="41" y="70.5" width="18" height="2.8" rx="1.4" fill="#f0ede6" opacity="0.88" />
          {/* Tongue tip just visible inside */}
          <ellipse cx="50" cy="82" rx="7" ry="4" fill="#e8608a" />
          <ellipse cx="48.5" cy="80.5" rx="1.6" ry="1" fill="white" opacity="0.25" />
        </g>

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

        {/* ── Zzz — sleeping exhale bubbles ──────────────────────────────────
             Three italic Z letters cascade from the mouth's right edge and
             float upper-right into the dark face stripe (white on dark =
             high contrast). Font sizes 15/20/25 SVG units give ~6/8/11 px
             at the 42 px header icon — clearly visible at any device scale.
             Italic style makes them instantly read as classic sleep Zzz.    */}
        <text
          aria-hidden="true"
          className="blg-zzz blg-z1"
          x="61" y="72"
          fontSize="26"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >z</text>
        <text
          aria-hidden="true"
          className="blg-zzz blg-z2"
          x="70" y="60"
          fontSize="35"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >z</text>
        <text
          aria-hidden="true"
          className="blg-zzz blg-z3"
          x="80" y="47"
          fontSize="44"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="'Inter', system-ui, -apple-system, sans-serif"
          fill="white"
          textAnchor="middle"
        >Z</text>
      </g>
      </g>
    </svg>
  );
}
