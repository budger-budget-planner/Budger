import { useState, useRef } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// iPhone frame — same as ApplePaySlides / ShareSheetSlides
// ─────────────────────────────────────────────────────────────────────────────
function Phone({ id, children }: { id: string; children: React.ReactNode }) {
  const clip = `bd-clip-${id}`;
  return (
    <svg
      viewBox="0 0 264 470"
      className="w-full max-w-[155px] mx-auto"
      style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.55))" }}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="11" y="11" width="242" height="448" rx="28" />
        </clipPath>
      </defs>
      {/* Body */}
      <rect x="0" y="0" width="264" height="470" rx="36" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />
      {/* Buttons */}
      <rect x="262" y="108" width="2.5" height="52" rx="1.2" fill="#27272a" />
      <rect x="0" y="92" width="2.5" height="30" rx="1.2" fill="#27272a" />
      <rect x="0" y="132" width="2.5" height="48" rx="1.2" fill="#27272a" />
      {/* Screen */}
      <rect x="11" y="11" width="242" height="448" rx="28" fill="#000" />
      <g clipPath={`url(#${clip})`}>
        <rect x="11" y="11" width="242" height="448" fill="#000" />
        {/* Status bar */}
        <text x="24" y="32" fontSize="10.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">9:41</text>
        {/* Dynamic island */}
        <rect x="96" y="16" width="72" height="18" rx="9" fill="#18181b" />
        {/* Battery */}
        <rect x="218" y="24" width="20" height="10" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.1" strokeOpacity="0.7" />
        <rect x="238" y="27" width="2" height="4" rx="1" fill="#fff" fillOpacity="0.4" />
        <rect x="219.5" y="25.5" width="13" height="7" rx="1.5" fill="#fff" fillOpacity="0.85" />
        {/* Signal */}
        <rect x="197" y="29" width="3" height="5" rx="0.8" fill="#fff" fillOpacity="0.4" />
        <rect x="202" y="27" width="3" height="7" rx="0.8" fill="#fff" fillOpacity="0.6" />
        <rect x="207" y="25" width="3" height="9" rx="0.8" fill="#fff" fillOpacity="0.85" />
        {children}
      </g>
    </svg>
  );
}

const FONT = "-apple-system,system-ui,sans-serif";

// ── Screen chrome shared by every slide: header + top divider ───────────────
function Header({ title }: { title: string }) {
  return (
    <>
      <rect x="11" y="44" width="242" height="50" fill="#000" />
      <text x="24" y="80" fontSize="22" fontWeight="700" fill="#fff" fontFamily={FONT}>{title}</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />
    </>
  );
}

// ── A category icon square, like the real transaction rows ──────────────────
function CatIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <>
      <rect x={x} y={y} width="36" height="36" rx="11" fill={color} fillOpacity="0.18" />
      <circle cx={x + 18} cy={y + 18} r="6" fill={color} />
    </>
  );
}

// ── Icon glyphs, abstracted to match the app's minimal SVG style ────────────
function IconWarehouse({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M0 4 L5 0 L10 4 Z" fill={color} />
      <rect x="0.5" y="4" width="9" height="6" fill={color} opacity="0.85" />
    </g>
  );
}
function IconScissors({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx="1.5" cy="1.5" r="1.5" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="1.5" cy="8.5" r="1.5" fill="none" stroke={color} strokeWidth="1" />
      <line x1="2.6" y1="2.4" x2="10" y2="8" stroke={color} strokeWidth="1" />
      <line x1="2.6" y1="7.6" x2="10" y2="2" stroke={color} strokeWidth="1" />
    </g>
  );
}
function IconTarget({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx="5" cy="5" r="4.6" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="5" cy="5" r="2.3" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="5" cy="5" r="0.9" fill={color} />
    </g>
  );
}
function IconCheck({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx="5" cy="5" r="4.6" fill="none" stroke={color} strokeWidth="1" />
      <polyline points="2.8,5 4.3,6.6 7.4,3.4" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
function IconCamera({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="0" y="1.5" width="12" height="9" rx="2.5" fill="none" stroke={color} strokeWidth="1" />
      <rect x="4" y="0" width="5" height="2.6" rx="1.2" fill={color} />
      <circle cx="6" cy="6" r="2.6" fill="none" stroke={color} strokeWidth="1" />
    </g>
  );
}
function IconLock({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M1.5 4.5 V3 a3 3 0 0 1 6 0 v1.5" fill="none" stroke={color} strokeWidth="1" />
      <rect x="0" y="4.5" width="9" height="6.5" rx="1.5" fill="none" stroke={color} strokeWidth="1" />
    </g>
  );
}

// ── A pill exactly like the expanded badge pills in HomeSpending ────────────
function Pill({
  x, y, width, borderColor, bgColor, textColor, label, icon, dark,
}: {
  x: number; y: number; width: number;
  borderColor: string; bgColor: string; textColor: string;
  label: string; icon: (p: { x: number; y: number; color: string }) => React.ReactNode;
  dark?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={width} height="24" rx="12" fill={dark ? "#000" : bgColor} fillOpacity={dark ? 1 : undefined} stroke={borderColor} strokeWidth="1" />
      {icon({ x: x + 10, y: y + 7, color: textColor })}
      <text x={x + 26} y={y + 16.5} fontSize="11" fontWeight="600" fill={textColor} fontFamily={FONT}>{label}</text>
    </g>
  );
}

// ── One realistic transaction row, expanded, with a single badge underneath ─
function BadgeRow({
  name, category, amount, catColor, pill,
}: {
  name: string; category: string; amount: string; catColor: string;
  pill: { width: number; borderColor: string; bgColor: string; textColor: string; label: string; icon: (p: { x: number; y: number; color: string }) => React.ReactNode; dark?: boolean };
}) {
  return (
    <>
      <rect x="16" y="118" width="232" height="118" rx="18" fill="#1c1c1e" stroke="#2e2e32" strokeWidth="1" />
      <CatIcon x={30} y={132} color={catColor} />
      <text x="78" y="150" fontSize="14.5" fontWeight="600" fill="#fff" fontFamily={FONT}>{name}</text>
      <text x="78" y="166" fontSize="10.5" fill="#8e8e93" fontFamily={FONT}>{category}</text>
      <text x="236" y="150" textAnchor="end" fontSize="14.5" fontWeight="600" fill="#fff" fontFamily={FONT}>{amount}</text>
      <Pill x={30} y={186} {...pill} />
    </>
  );
}

// ── Collapsed-view echo: category row + small colored dot, shown low on screen ─
function CollapsedEcho({ dotColor, label }: { dotColor: string; label: string }) {
  return (
    <>
      <text x="24" y="278" fontSize="9" fontWeight="600" fill="#48484d" letterSpacing="0.5" fontFamily={FONT}>COLLAPSED VIEW</text>
      <rect x="16" y="288" width="232" height="46" rx="14" fill="#1c1c1e" opacity="0.7" />
      <text x="30" y="316" fontSize="12.5" fill="#c7c7cc" fontFamily={FONT}>Uncategorized</text>
      <circle cx="122" cy="312" r="3" fill={dotColor} />
      <text x="132" y="316" fontSize="9.5" fill="#636368" fontFamily={FONT}>{label}</text>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Overview: three rows, three different badges
// ─────────────────────────────────────────────────────────────────────────────
function Mockup1() {
  return (
    <Phone id="b1">
      <Header title="Spending" />
      <rect x="16" y="106" width="232" height="52" rx="15" fill="#1c1c1e" />
      <text x="30" y="128" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>Whole Foods</text>
      <text x="236" y="128" textAnchor="end" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>−$62.10</text>
      <circle cx="34" cy="141" r="3" fill="#f472b6" />
      <circle cx="44" cy="141" r="3" fill="#a78bfa" />

      <rect x="16" y="164" width="232" height="52" rx="15" fill="#1c1c1e" />
      <text x="30" y="186" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>Amazon</text>
      <text x="236" y="186" textAnchor="end" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>−$28.40</text>
      <circle cx="30" cy="199" r="3" fill="#fff" />

      <rect x="16" y="222" width="232" height="72" rx="16" fill="#1c1c1e" stroke="#3a3a3e" strokeWidth="1" />
      <text x="30" y="244" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>Rent</text>
      <text x="236" y="244" textAnchor="end" fontSize="13" fontWeight="600" fill="#fff" fontFamily={FONT}>−€900.00</text>
      <Pill x={30} y={256} width={92} borderColor="#71717a" bgColor="rgba(113,113,122,0.1)" textColor="#a1a1aa" label="EUR" icon={IconLock} />

      <text x="132" y="322" textAnchor="middle" fontSize="10" fill="#636368" fontFamily={FONT}>Tap a row to see the full badge</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — From Larder
// ─────────────────────────────────────────────────────────────────────────────
function Mockup2() {
  return (
    <Phone id="b2">
      <Header title="Spending" />
      <BadgeRow
        name="Farmers Market" category="Groceries" amount="−$34.00" catColor="#22c55e"
        pill={{ width: 118, borderColor: "rgba(255,255,255,0.5)", bgColor: "#000", textColor: "#fff", label: "From Larder", icon: IconWarehouse, dark: true }}
      />
      <CollapsedEcho dotColor="#fff" label="white sparkling dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Split
// ─────────────────────────────────────────────────────────────────────────────
function Mockup3() {
  return (
    <Phone id="b3">
      <Header title="Spending" />
      <BadgeRow
        name="Dinner at Nori" category="Dining" amount="−$41.50" catColor="#f97316"
        pill={{ width: 66, borderColor: "rgba(236,72,153,0.6)", bgColor: "rgba(236,72,153,0.1)", textColor: "#f472b6", label: "Split", icon: IconScissors }}
      />
      <CollapsedEcho dotColor="#ec4899" label="pink dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Goal / Larder dedication
// ─────────────────────────────────────────────────────────────────────────────
function Mockup4() {
  return (
    <Phone id="b4">
      <Header title="Spending" />
      <BadgeRow
        name="Freelance payout" category="Income" amount="+$500.00" catColor="#0a84ff"
        pill={{ width: 118, borderColor: "rgba(139,92,246,0.6)", bgColor: "rgba(139,92,246,0.1)", textColor: "#a78bfa", label: "Vacation $120", icon: IconTarget }}
      />
      <CollapsedEcho dotColor="#8b5cf6" label="violet dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — Realized Goal
// ─────────────────────────────────────────────────────────────────────────────
function Mockup5() {
  return (
    <Phone id="b5">
      <Header title="Spending" />
      <BadgeRow
        name="New Laptop" category="Electronics" amount="−$1,200.00" catColor="#0a84ff"
        pill={{ width: 108, borderColor: "rgba(45,212,191,0.6)", bgColor: "rgba(45,212,191,0.1)", textColor: "#5eead4", label: "Realized Goal", icon: IconCheck }}
      />
      <text x="24" y="278" fontSize="9.5" fill="#48484d" fontFamily={FONT}>excluded from this month's total</text>
      <CollapsedEcho dotColor="#5eead4" label="teal dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — Receipt
// ─────────────────────────────────────────────────────────────────────────────
function Mockup6() {
  return (
    <Phone id="b6">
      <Header title="Spending" />
      <BadgeRow
        name="Home Depot" category="Home" amount="−$76.30" catColor="#eab308"
        pill={{ width: 84, borderColor: "rgba(255,255,255,0.4)", bgColor: "rgba(255,255,255,0.1)", textColor: "#fff", label: "Receipt", icon: IconCamera }}
      />
      <CollapsedEcho dotColor="#fff" label="white dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 7 — Locked currency
// ─────────────────────────────────────────────────────────────────────────────
function Mockup7() {
  return (
    <Phone id="b7">
      <Header title="Spending" />
      <BadgeRow
        name="Hotel Lisbon" category="Travel" amount="−€310.00" catColor="#f97316"
        pill={{ width: 74, borderColor: "rgba(113,113,122,0.6)", bgColor: "rgba(113,113,122,0.1)", textColor: "#a1a1aa", label: "EUR", icon: IconLock }}
      />
      <CollapsedEcho dotColor="#a1a1aa" label="gray dot" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 8 — Legend / summary of every badge color
// ─────────────────────────────────────────────────────────────────────────────
function Mockup8() {
  const rows: [string, string][] = [
    ["#fff",    "From Larder"],
    ["#ec4899", "Split"],
    ["#8b5cf6", "Goal / Larder"],
    ["#5eead4", "Realized Goal"],
    ["#fff",    "Receipt"],
    ["#a1a1aa", "Locked currency"],
  ];
  return (
    <Phone id="b8">
      <Header title="Legend" />
      <rect x="16" y="106" width="232" height="252" rx="20" fill="#1c1c1e" stroke="#2e2e32" strokeWidth="1" />
      {rows.map(([color, label], i) => (
        <g key={label}>
          <circle cx="36" cy={134 + i * 38} r="4.5" fill={color} />
          <text x="52" y={138 + i * 38} fontSize="12.5" fontWeight="500" fill="#ebebf0" fontFamily={FONT}>{label}</text>
        </g>
      ))}
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slides registry
// ─────────────────────────────────────────────────────────────────────────────
const SLIDES = [
  { mockup: <Mockup1 />, titleKey: "badges.s1_title", descKey: "badges.s1_desc" },
  { mockup: <Mockup2 />, titleKey: "badges.s2_title", descKey: "badges.s2_desc" },
  { mockup: <Mockup3 />, titleKey: "badges.s3_title", descKey: "badges.s3_desc" },
  { mockup: <Mockup4 />, titleKey: "badges.s4_title", descKey: "badges.s4_desc" },
  { mockup: <Mockup5 />, titleKey: "badges.s5_title", descKey: "badges.s5_desc" },
  { mockup: <Mockup6 />, titleKey: "badges.s6_title", descKey: "badges.s6_desc" },
  { mockup: <Mockup7 />, titleKey: "badges.s7_title", descKey: "badges.s7_desc" },
  { mockup: <Mockup8 />, titleKey: "badges.s8_title", descKey: "badges.s8_desc" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component — same interface as ApplePaySlides / ShareSheetSlides
// ─────────────────────────────────────────────────────────────────────────────
interface BadgesSlidesProps {
  onDone?: () => void;
  onClose?: () => void;
  modal?: boolean;
}

export default function BadgesSlides({ onDone, onClose, modal = false }: BadgesSlidesProps) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const total = SLIDES.length;
  const isLast = idx === total - 1;
  const slide = SLIDES[idx];

  function goNext() {
    if (isLast) { onDone?.(); onClose?.(); }
    else setIdx(i => i + 1);
  }
  function goPrev() {
    if (idx > 0) setIdx(i => i - 1);
  }

  const inner = (
    <div className="flex flex-col w-full max-w-sm mx-auto gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {t("badges.setup_title")}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {t("man.step_of", { n: idx + 1, total })}
          </p>
        </div>
        {modal && onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-90"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Slide card ── */}
      <div
        className="relative bg-card border border-border rounded-3xl flex-shrink-0 flex flex-col items-center overflow-hidden"
        style={{ height: 440 }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchStartX.current === null) return;
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) < 40) return;
          if (delta < 0) goNext();
          else goPrev();
        }}
      >
        {/* Tap zones */}
        <button
          onClick={goPrev}
          disabled={idx === 0}
          className="absolute inset-y-0 left-0 w-1/2 z-10 disabled:cursor-default"
          aria-label={t("man.prev")}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
        <button
          onClick={goNext}
          className="absolute inset-y-0 right-0 w-1/2 z-10"
          aria-label={t("man.next")}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />

        {/* Content */}
        <div className="pointer-events-none flex flex-col items-center w-full h-full px-4 pt-5 pb-4">

          {/* Phone mockup */}
          <div className="flex items-center justify-center w-full overflow-hidden flex-shrink-0" style={{ height: 200 }}>
            {slide.mockup}
          </div>

          {/* Title + description */}
          <div className="flex-1 flex flex-col items-center justify-center w-full gap-1 py-3">
            <h3 className="text-[13.5px] font-bold text-foreground text-center leading-snug">
              {t(slide.titleKey)}
            </h3>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {t(slide.descKey)}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5 flex-shrink-0">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === idx ? "w-5 bg-foreground" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          {/* Tap hint — fixed slot to keep dots stable */}
          <div className="h-5 flex items-center justify-center flex-shrink-0 mt-2">
            {idx === 0 && (
              <p className="text-[9px] text-muted-foreground/35 tracking-widest uppercase">
                {t("man.tap_hint")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!modal) return inner;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col px-5 pt-12 pb-8">
      {inner}
    </div>
  );
}
