import { useState, useEffect, useId, useRef } from "react";

type Anim = "wink" | "sniff" | "lick" | null;

const ANIM_MS: Record<NonNullable<Anim>, number> = {
  wink: 1400,
  sniff: 2000,
  lick: 2400,
};

export default function BadgerLogo({ size = 40 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const [anim, setAnim] = useState<Anim>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const resetRef    = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Fire exactly every 10 s regardless of animation duration
    intervalRef.current = setInterval(() => {
      const choices: NonNullable<Anim>[] = ["wink", "sniff", "lick"];
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      setAnim(chosen);
      clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setAnim(null), ANIM_MS[chosen] + 150);
    }, 10_000);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(resetRef.current);
    };
  }, []);

  // blg- prefix avoids collisions with any global class names
  const grp = anim ? `blg-${anim}` : "blg-idle";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Budger badger logo"
    >
      <defs>
        <linearGradient id={`bgBorderGrad-${uid}`} x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#999" />
          <stop offset="55%"  stopColor="#505050" />
          <stop offset="100%" stopColor="#2a2a2a" />
        </linearGradient>

        <style>{`
          /* ── shared ── */
          .blg-eye-r, .blg-nose, .blg-tongue {
            transform-box: fill-box;
            transform-origin: center;
          }

          /* ══ Animation 1: WINK (right eye) ══ */
          .blg-wink .blg-eye-r {
            animation: blg-wink 1.4s ease-in-out forwards;
          }
          @keyframes blg-wink {
            0%   { transform: scaleY(1); }
            15%  { transform: scaleY(0.06); }
            52%  { transform: scaleY(0.06); }
            72%  { transform: scaleY(1.1); }
            85%  { transform: scaleY(0.95); }
            100% { transform: scaleY(1); }
          }

          /* ══ Animation 2: SNIFF (nose bobs) ══ */
          .blg-sniff .blg-nose {
            animation: blg-sniff 2.0s ease-in-out forwards;
          }
          @keyframes blg-sniff {
            0%   { transform: translateY(0px)    scaleX(1); }
            10%  { transform: translateY(-3.5px) scaleX(1.08); }
            24%  { transform: translateY(1.5px)  scaleX(0.96); }
            40%  { transform: translateY(-3px)   scaleX(1.07); }
            55%  { transform: translateY(1px)    scaleX(0.97); }
            70%  { transform: translateY(-2px)   scaleX(1.05); }
            84%  { transform: translateY(0.5px)  scaleX(0.99); }
            100% { transform: translateY(0px)    scaleX(1); }
          }

          /* ══ Animation 3: LICK (tongue sweeps mouth) ══ */
          /* Tongue is invisible by default */
          .blg-tongue { opacity: 0; }

          .blg-lick .blg-tongue {
            animation: blg-lick 2.4s ease-in-out forwards;
          }
          @keyframes blg-lick {
            /* pop out */
            0%   { opacity: 0; transform: scaleY(0.1) translateY(0px); }
            7%   { opacity: 1; transform: scaleY(1)   translateY(0px); }
            /* sweep left */
            27%  { opacity: 1; transform: scaleX(0.75) scaleY(0.9) translateX(-10px) translateY(2px) rotate(-14deg); }
            /* sweep right */
            58%  { opacity: 1; transform: scaleX(0.75) scaleY(0.9) translateX(10px)  translateY(2px) rotate(14deg); }
            /* centre and retract */
            78%  { opacity: 1; transform: scaleY(1) translateX(0) translateY(0); }
            90%  { opacity: 0; transform: scaleY(0.1) translateY(-2px); }
            100% { opacity: 0; }
          }
        `}</style>
      </defs>

      {/* ── Static structural layers ── */}
      <rect width="100" height="100" rx="22" fill="#111" />
      <rect x="1" y="1" width="98" height="98" rx="21.5" fill="none" stroke={`url(#bgBorderGrad-${uid})`} strokeWidth="1.5" />

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

      {/* White center stripe */}
      <ellipse cx="50" cy="40" rx="10" ry="18" fill="#F0EDE6" />

      {/* Cheek puffs */}
      <ellipse cx="10" cy="52" rx="13" ry="19" fill="#F0EDE6" />
      <ellipse cx="90" cy="52" rx="13" ry="19" fill="#F0EDE6" />

      {/* Lower muzzle */}
      <ellipse cx="50" cy="70" rx="20" ry="14" fill="#E8E4DC" />

      {/* ── Animated group — class drives which child animates ── */}
      <g className={grp}>

        {/* Left eye — never animates */}
        <circle cx="29" cy="48" r="10.5" fill="white" />
        <circle cx="30" cy="49" r="7"    fill="#0d0d0d" />
        <circle cx="32.5" cy="47" r="2.5" fill="white" />

        {/* Right eye — WINK target */}
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
          {/* tongue body */}
          <ellipse cx="50" cy="79.5" rx="6.5" ry="5"   fill="#e8608a" />
          {/* tongue root blending into mouth */}
          <ellipse cx="50" cy="76.5" rx="4"   ry="2.8" fill="#e8608a" />
          {/* median sulcus crease */}
          <line
            x1="50" y1="75.5"
            x2="50" y2="83.5"
            stroke="#c0406a"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.55"
          />
          {/* sheen highlight */}
          <ellipse cx="48" cy="77.5" rx="1.8" ry="1" fill="white" opacity="0.3" />
        </g>
      </g>
    </svg>
  );
}
