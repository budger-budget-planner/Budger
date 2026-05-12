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
      {/* ── Wide cream-white head base ── */}
      <ellipse cx="50" cy="52" rx="42" ry="34" fill="#F0EDE6" />

      {/* ── Ears — small, grey, wide-set ── */}
      <ellipse cx="19" cy="24" rx="12" ry="11" fill="#777" />
      <ellipse cx="81" cy="24" rx="12" ry="11" fill="#777" />
      <ellipse cx="19" cy="25" rx="7"  ry="6.5" fill="#aaa" />
      <ellipse cx="81" cy="25" rx="7"  ry="6.5" fill="#aaa" />

      {/*
        ── THE DEFINING EUROPEAN BADGER PATTERN ──
        Pattern from left to right:
          white cheek | BLACK stripe | white center | BLACK stripe | white cheek
        The black stripes run from the nose sides upward through the eyes to the ears.
      */}

      {/* Left black stripe — wide, from lower nose-left up through eye to top-left */}
      <path
        d="M 33 74 Q 24 60 20 46 Q 17 33 20 22"
        stroke="#111"
        strokeWidth="19"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right black stripe — mirror */}
      <path
        d="M 67 74 Q 76 60 80 46 Q 83 33 80 22"
        stroke="#111"
        strokeWidth="19"
        strokeLinecap="round"
        fill="none"
      />

      {/* White center stripe (between the two black stripes) — forehead to nose bridge */}
      <ellipse cx="50" cy="40" rx="11" ry="18" fill="#F0EDE6" />

      {/* White outer cheek puffs (flanking the stripes) */}
      <ellipse cx="11" cy="52" rx="13" ry="19" fill="#F0EDE6" />
      <ellipse cx="89" cy="52" rx="13" ry="19" fill="#F0EDE6" />

      {/* White lower muzzle / chin */}
      <ellipse cx="50" cy="70" rx="20" ry="14" fill="#E8E4DC" />

      {/* ── Eyes — large white sclera on the black stripe, very expressive ── */}
      <circle cx="29" cy="48" r="10.5" fill="white" />
      <circle cx="71" cy="48" r="10.5" fill="white" />
      {/* Iris */}
      <circle cx="30"  cy="49" r="7"   fill="#0d0d0d" />
      <circle cx="70"  cy="49" r="7"   fill="#0d0d0d" />
      {/* Highlight */}
      <circle cx="32.5" cy="47" r="2.5" fill="white" />
      <circle cx="72.5" cy="47" r="2.5" fill="white" />

      {/* ── Large, prominent, flat badger nose ── */}
      <ellipse cx="50" cy="67" rx="9"   ry="7"   fill="#111" />
      <ellipse cx="47" cy="65" rx="3"   ry="2.2" fill="#2a2a2a" />

      {/* Gentle smile */}
      <path
        d="M 41 73 Q 50 81 59 73"
        stroke="#999"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
