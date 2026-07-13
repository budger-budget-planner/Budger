import { useState, useRef } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// iPhone frame — minimal, professional
// ─────────────────────────────────────────────────────────────────────────────
function Phone({ id, children }: { id: string; children: React.ReactNode }) {
  const clip = `man-clip-${id}`;
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

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Result: Budger Spending with scanned rows
// ─────────────────────────────────────────────────────────────────────────────
function Mockup1() {
  return (
    <Phone id="m1">
      {/* App header */}
      <rect x="11" y="44" width="242" height="50" fill="#000" />
      <text x="24" y="80" fontSize="22" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Spending</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />

      {/* "Scanned" badge */}
      <rect x="58" y="102" width="148" height="22" rx="11" fill="#a855f7" fillOpacity="0.15" />
      {/* camera icon */}
      <rect x="68" y="108" width="12" height="9" rx="2.5" fill="#a855f7" opacity="0.85" />
      <rect x="72" y="106" width="5" height="3" rx="1.5" fill="#a855f7" opacity="0.85" />
      <text x="150" y="117" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#a855f7" letterSpacing="0.2" fontFamily="-apple-system,system-ui,sans-serif">SCANNED · 3 LOGGED</text>

      {/* Row 1 — bright, most recent */}
      <rect x="16" y="132" width="232" height="58" rx="14" fill="#1c1c1e" stroke="#a855f7" strokeWidth="0.9" strokeOpacity="0.65" />
      <rect x="28" y="146" width="30" height="28" rx="8" fill="#a855f7" opacity="0.8" />
      <rect x="33" y="152" width="20" height="3" rx="1.5" fill="#fff" opacity="0.65" />
      <rect x="33" y="158" width="14" height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <text x="68" y="161" fontSize="13.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Starbucks</text>
      <text x="68" y="177" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Today</text>
      <text x="240" y="161" textAnchor="end" fontSize="13.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">−$4.85</text>

      {/* Row 2 */}
      <rect x="16" y="198" width="232" height="58" rx="14" fill="#1c1c1e" stroke="#a855f7" strokeWidth="0.7" strokeOpacity="0.3" />
      <rect x="28" y="212" width="30" height="28" rx="8" fill="#3a3a3e" />
      <rect x="33" y="218" width="20" height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <rect x="33" y="224" width="12" height="3" rx="1.5" fill="#fff" opacity="0.2" />
      <text x="68" y="227" fontSize="13.5" fontWeight="500" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">IKEA</text>
      <text x="68" y="243" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Yesterday</text>
      <text x="240" y="227" textAnchor="end" fontSize="13.5" fontWeight="500" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">−$89.00</text>

      {/* Row 3 — faded */}
      <rect x="16" y="264" width="232" height="58" rx="14" fill="#1c1c1e" opacity="0.55" stroke="#a855f7" strokeWidth="0.5" strokeOpacity="0.12" />
      <rect x="28" y="278" width="30" height="28" rx="8" fill="#2a2a2e" />
      <rect x="33" y="284" width="16" height="3" rx="1.5" fill="#fff" opacity="0.2" />
      <text x="68" y="291" fontSize="13.5" fontWeight="400" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Bolt</text>
      <text x="68" y="307" fontSize="10" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">Jul 5</text>
      <text x="240" y="291" textAnchor="end" fontSize="13.5" fontWeight="400" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">−$12.40</text>

      {/* Bottom nav */}
      <rect x="11" y="416" width="242" height="0.5" fill="#2a2a2e" />
      <rect x="11" y="416" width="242" height="43" fill="#0d0d0d" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Apple Wallet / bank app transaction list
// ─────────────────────────────────────────────────────────────────────────────
function Mockup2() {
  return (
    <Phone id="m2">
      {/* Green bank card */}
      <rect x="16" y="46" width="232" height="118" rx="18" fill="#14532d" />
      {/* card gloss */}
      <rect x="16" y="46" width="232" height="58" rx="18" fill="#16a34a" fillOpacity="0.28" />
      <rect x="16" y="94" width="232" height="20" fill="#14532d" />
      {/* chip */}
      <rect x="30" y="64" width="28" height="20" rx="4" fill="#ca8a04" opacity="0.9" />
      <rect x="30" y="72" width="28" height="2.5" fill="#000" opacity="0.18" />
      <rect x="37" y="64" width="2" height="20" fill="#000" opacity="0.1" />
      {/* contactless arcs */}
      <path d="M 204 72 Q 209 67 214 72" fill="none" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.5" strokeLinecap="round" />
      <path d="M 200 72 Q 209 63 218 72" fill="none" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.3" strokeLinecap="round" />
      {/* dots */}
      <circle cx="34" cy="114" r="2.8" fill="#fff" opacity="0.35" />
      <circle cx="43" cy="114" r="2.8" fill="#fff" opacity="0.35" />
      <circle cx="52" cy="114" r="2.8" fill="#fff" opacity="0.35" />
      <circle cx="61" cy="114" r="2.8" fill="#fff" opacity="0.35" />
      <text x="76" y="118" fontSize="12" fontWeight="500" fill="#fff" opacity="0.7" fontFamily="-apple-system,system-ui,sans-serif">4242</text>
      {/* balance */}
      <text x="238" y="72" textAnchor="end" fontSize="9" fill="#fff" opacity="0.55" letterSpacing="0.3" fontFamily="-apple-system,system-ui,sans-serif">AVAILABLE</text>
      <text x="238" y="88" textAnchor="end" fontSize="17" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">$2,847.50</text>

      {/* Section label */}
      <text x="24" y="182" fontSize="10" fontWeight="600" fill="#636368" letterSpacing="0.6" fontFamily="-apple-system,system-ui,sans-serif">LATEST TRANSACTIONS</text>
      <rect x="11" y="188" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 1 */}
      <rect x="11" y="188" width="242" height="52" fill="#000" />
      <text x="24" y="210" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Starbucks</text>
      <text x="24" y="228" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 8 · Coffee</text>
      <text x="243" y="210" textAnchor="end" fontSize="13" fontWeight="500" fill="#ff453a" fontFamily="-apple-system,system-ui,sans-serif">−$4.85</text>
      <rect x="11" y="240" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 2 */}
      <rect x="11" y="240" width="242" height="52" fill="#000" />
      <text x="24" y="262" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">IKEA</text>
      <text x="24" y="280" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 6 · Home</text>
      <text x="243" y="262" textAnchor="end" fontSize="13" fontWeight="500" fill="#ff453a" fontFamily="-apple-system,system-ui,sans-serif">−$89.00</text>
      <rect x="11" y="292" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 3 */}
      <rect x="11" y="292" width="242" height="52" fill="#000" />
      <text x="24" y="314" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Bolt</text>
      <text x="24" y="332" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 5 · Transport</text>
      <text x="243" y="314" textAnchor="end" fontSize="13" fontWeight="500" fill="#ff453a" fontFamily="-apple-system,system-ui,sans-serif">−$12.40</text>
      <rect x="11" y="344" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 4 — faded */}
      <rect x="11" y="344" width="242" height="52" fill="#000" opacity="0.45" />
      <text x="24" y="366" fontSize="13" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">H&amp;M</text>
      <text x="24" y="384" fontSize="10" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">Jul 3 · Shopping</text>
      <text x="243" y="366" textAnchor="end" fontSize="13" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">−$45.00</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Budger scanner dialog: scope toggle + choose screenshot
// ─────────────────────────────────────────────────────────────────────────────
function Mockup3() {
  return (
    <Phone id="m3">
      {/* Blurred app background */}
      <rect x="11" y="44" width="242" height="415" fill="#0d0d0d" />
      <text x="24" y="80" fontSize="20" fontWeight="700" fill="#fff" opacity="0.15" fontFamily="-apple-system,system-ui,sans-serif">Spending</text>
      <rect x="16" y="98" width="232" height="50" rx="13" fill="#1c1c1e" opacity="0.2" />
      <rect x="16" y="156" width="232" height="50" rx="13" fill="#1c1c1e" opacity="0.12" />
      <rect x="16" y="214" width="232" height="50" rx="13" fill="#1c1c1e" opacity="0.07" />

      {/* Dim overlay */}
      <rect x="11" y="44" width="242" height="415" fill="#000" opacity="0.62" />

      {/* Dialog card */}
      <rect x="18" y="108" width="228" height="266" rx="22" fill="#1c1c1e" stroke="#2e2e32" strokeWidth="1" />

      {/* Badger icon (simplified circle) */}
      <circle cx="132" cy="148" r="22" fill="#27272a" />
      <circle cx="132" cy="148" r="11" fill="#3a3a3e" />
      <circle cx="127" cy="145" r="3" fill="#fff" opacity="0.9" />
      <circle cx="137" cy="145" r="3" fill="#fff" opacity="0.9" />
      <ellipse cx="132" cy="152" rx="5" ry="3.5" fill="#fff" opacity="0.5" />
      <circle cx="120" cy="141" r="7" fill="#3a3a3e" />
      <circle cx="144" cy="141" r="7" fill="#3a3a3e" />

      {/* Dialog title */}
      <text x="132" y="194" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Import Screenshot</text>

      {/* Scope label */}
      <text x="132" y="218" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#636368" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">IMPORT SCOPE</text>

      {/* "All logs" button — unselected */}
      <rect x="28" y="225" width="94" height="36" rx="12" fill="#2a2a2e" stroke="#3a3a3e" strokeWidth="0.8" />
      <text x="75" y="247" textAnchor="middle" fontSize="12" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">All logs</text>

      {/* "This month" button — selected */}
      <rect x="142" y="225" width="94" height="36" rx="12" fill="#fff" />
      <text x="189" y="247" textAnchor="middle" fontSize="12" fontWeight="600" fill="#000" fontFamily="-apple-system,system-ui,sans-serif">This month</text>

      {/* Divider */}
      <rect x="28" y="275" width="208" height="0.5" fill="#2e2e32" />

      {/* Choose screenshot button */}
      <rect x="28" y="287" width="208" height="44" rx="14" fill="#0a84ff" />
      {/* camera icon */}
      <rect x="46" y="301" width="18" height="14" rx="3.5" fill="#fff" opacity="0.9" />
      <rect x="50" y="298" width="10" height="5" rx="2" fill="#fff" opacity="0.9" />
      <circle cx="55" cy="308" r="3.5" fill="#0a84ff" />
      <text x="148" y="313" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Choose Screenshot</text>

      {/* Cancel */}
      <text x="132" y="354" textAnchor="middle" fontSize="13" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Cancel</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Review screen with checkboxes
// ─────────────────────────────────────────────────────────────────────────────
function Mockup4() {
  return (
    <Phone id="m4">
      {/* Header */}
      <rect x="11" y="44" width="242" height="50" fill="#000" />
      <text x="24" y="76" fontSize="17" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Review</text>
      <rect x="88" y="63" width="64" height="22" rx="11" fill="#a855f7" fillOpacity="0.15" />
      <text x="120" y="78" textAnchor="middle" fontSize="10" fontWeight="700" fill="#a855f7" fontFamily="-apple-system,system-ui,sans-serif">4 found</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />

      {/* Row 1 — checked */}
      <rect x="11" y="94" width="242" height="56" fill="#000" />
      <circle cx="30" cy="122" r="10" fill="#0a84ff" />
      <polyline points="24,122 28,126.5 36,117.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="50" y="116" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Starbucks</text>
      <text x="50" y="133" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 8</text>
      <text x="243" y="116" textAnchor="end" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">$4.85</text>
      <rect x="11" y="150" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 2 — checked */}
      <rect x="11" y="150" width="242" height="56" fill="#000" />
      <circle cx="30" cy="178" r="10" fill="#0a84ff" />
      <polyline points="24,178 28,182.5 36,173.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="50" y="172" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">IKEA</text>
      <text x="50" y="189" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 6</text>
      <text x="243" y="172" textAnchor="end" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">$89.00</text>
      <rect x="11" y="206" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 3 — checked */}
      <rect x="11" y="206" width="242" height="56" fill="#000" />
      <circle cx="30" cy="234" r="10" fill="#0a84ff" />
      <polyline points="24,234 28,238.5 36,229.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="50" y="228" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Bolt</text>
      <text x="50" y="245" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Jul 5</text>
      <text x="243" y="228" textAnchor="end" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">$12.40</text>
      <rect x="11" y="262" width="242" height="0.5" fill="#1e1e22" />

      {/* Row 4 — unchecked, greyed (out of month) */}
      <rect x="11" y="262" width="242" height="56" fill="#000" opacity="0.45" />
      <circle cx="30" cy="290" r="10" fill="none" stroke="#3a3a3e" strokeWidth="1.8" />
      <text x="50" y="284" fontSize="13" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">H&amp;M</text>
      <text x="50" y="301" fontSize="9.5" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">Jun 3 · out of month</text>
      <text x="243" y="284" textAnchor="end" fontSize="13" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">$45.00</text>
      <rect x="11" y="318" width="242" height="0.5" fill="#1e1e22" />

      {/* Import button */}
      <rect x="16" y="330" width="232" height="44" rx="14" fill="#0a84ff" />
      <text x="132" y="357" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Import 3</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slides registry
// ─────────────────────────────────────────────────────────────────────────────
const SLIDES = [
  { mockup: <Mockup1 />, titleKey: "man.s1_title", descKey: "man.s1_desc" },
  { mockup: <Mockup2 />, titleKey: "man.s2_title", descKey: "man.s2_desc" },
  { mockup: <Mockup3 />, titleKey: "man.s3_title", descKey: "man.s3_desc" },
  { mockup: <Mockup4 />, titleKey: "man.s4_title", descKey: "man.s4_desc" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component (same interface as before — swappable in NotificationCenter)
// ─────────────────────────────────────────────────────────────────────────────
interface ApplePaySlidesProps {
  onDone?: () => void;
  onClose?: () => void;
  modal?: boolean;
}

export default function ApplePaySlides({ onDone, onClose, modal = false }: ApplePaySlidesProps) {
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
            {t("man.setup_title")}
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
