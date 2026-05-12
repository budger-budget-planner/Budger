export default function BadgerLogo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Budger badger logo"
    >
      {/* Body / head base — mid grey */}
      <ellipse cx="40" cy="44" rx="28" ry="26" fill="#9CA3AF" />

      {/* Ears */}
      <ellipse cx="15" cy="22" rx="9" ry="11" fill="#6B7280" />
      <ellipse cx="65" cy="22" rx="9" ry="11" fill="#6B7280" />
      {/* Inner ear */}
      <ellipse cx="15" cy="23" rx="5" ry="7" fill="#D1D5DB" />
      <ellipse cx="65" cy="23" rx="5" ry="7" fill="#D1D5DB" />

      {/* White face sides */}
      <ellipse cx="27" cy="50" rx="13" ry="16" fill="#F9FAFB" />
      <ellipse cx="53" cy="50" rx="13" ry="16" fill="#F9FAFB" />

      {/* Black centre stripe — top to nose */}
      <rect x="34" y="18" width="12" height="34" rx="6" fill="#111827" />

      {/* Eyes — white base */}
      <circle cx="28" cy="40" r="7" fill="white" />
      <circle cx="52" cy="40" r="7" fill="white" />
      {/* Eyes — iris */}
      <circle cx="29" cy="41" r="4.5" fill="#111827" />
      <circle cx="51" cy="41" r="4.5" fill="#111827" />
      {/* Eyes — highlight */}
      <circle cx="31" cy="39" r="1.5" fill="white" />
      <circle cx="53" cy="39" r="1.5" fill="white" />

      {/* Nose */}
      <ellipse cx="40" cy="54" rx="5" ry="3.5" fill="#111827" />
      {/* Nose highlight */}
      <ellipse cx="38.5" cy="53" rx="1.5" ry="1" fill="#374151" />

      {/* Smile */}
      <path d="M33 59 Q40 65 47 59" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Cheek blush */}
      <ellipse cx="20" cy="52" rx="5" ry="3" fill="#E5E7EB" opacity="0.6" />
      <ellipse cx="60" cy="52" rx="5" ry="3" fill="#E5E7EB" opacity="0.6" />
    </svg>
  );
}
