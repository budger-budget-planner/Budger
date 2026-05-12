export default function BadgerLogo({ size = 40 }: { size?: number }) {
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
      {/* Grey body peeking at the bottom */}
      <ellipse cx="50" cy="86" rx="30" ry="12" fill="#9CA3AF" />

      {/* Main head — wide, flat, cream-white (badger face is white) */}
      <ellipse cx="50" cy="55" rx="38" ry="30" fill="#F0EDE6" />

      {/* Ears — small, round, set wide on top of head */}
      <ellipse cx="21" cy="30" rx="10" ry="9" fill="#D1D5DB" />
      <ellipse cx="79" cy="30" rx="10" ry="9" fill="#D1D5DB" />
      {/* Inner ear */}
      <ellipse cx="21" cy="31" rx="5.5" ry="5" fill="#E9E6E0" />
      <ellipse cx="79" cy="31" rx="5.5" ry="5" fill="#E9E6E0" />

      {/* ── THE DEFINING BADGER FEATURE ──
           Two wide black stripes running from the nose sides,
           through the eyes, up over the forehead and ears. */}
      {/* Left black stripe */}
      <path
        d="M 32 76 Q 24 62 19 48 Q 15 36 18 26 Q 20 20 24 20"
        stroke="#111827"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right black stripe */}
      <path
        d="M 68 76 Q 76 62 81 48 Q 85 36 82 26 Q 80 20 76 20"
        stroke="#111827"
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />

      {/* White center forehead between the stripes */}
      <ellipse cx="50" cy="40" rx="13" ry="14" fill="#F0EDE6" />

      {/* White lower muzzle / chin area */}
      <ellipse cx="50" cy="70" rx="22" ry="14" fill="#F0EDE6" />

      {/* White bridge areas flanking the nose */}
      <ellipse cx="37" cy="59" rx="7" ry="5" fill="#F0EDE6" />
      <ellipse cx="63" cy="59" rx="7" ry="5" fill="#F0EDE6" />

      {/* Eyes — big white sclera circles, positioned on the black stripe */}
      <circle cx="30" cy="51" r="10" fill="white" />
      <circle cx="70" cy="51" r="10" fill="white" />
      {/* Iris */}
      <circle cx="31" cy="52" r="6.5" fill="#111827" />
      <circle cx="69" cy="52" r="6.5" fill="#111827" />
      {/* Highlight */}
      <circle cx="33" cy="50" r="2.2" fill="white" />
      <circle cx="71" cy="50" r="2.2" fill="white" />

      {/* Wide, flat badger nose */}
      <ellipse cx="50" cy="65" rx="7.5" ry="5.5" fill="#1F2937" />
      <ellipse cx="47.5" cy="63.5" rx="2.5" ry="1.8" fill="#374151" />

      {/* Subtle smile */}
      <path
        d="M 42 72 Q 50 79 58 72"
        stroke="#9CA3AF"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
