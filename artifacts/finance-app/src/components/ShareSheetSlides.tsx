import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Shared iPhone frame
// ─────────────────────────────────────────────────────────────────────────────
function Phone({ id, children }: { id: string; children: React.ReactNode }) {
  const clip = `ss-clip-${id}`;
  return (
    <svg viewBox="0 0 264 470" className="w-full max-w-[155px] mx-auto" style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.55))" }}>
      <defs>
        <clipPath id={clip}>
          <rect x="11" y="11" width="242" height="448" rx="28" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="264" height="470" rx="36" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />
      <rect x="262" y="108" width="2.5" height="52" rx="1.2" fill="#27272a" />
      <rect x="0" y="92" width="2.5" height="30" rx="1.2" fill="#27272a" />
      <rect x="0" y="132" width="2.5" height="48" rx="1.2" fill="#27272a" />
      <rect x="11" y="11" width="242" height="448" rx="28" fill="#000" />
      <g clipPath={`url(#${clip})`}>
        <rect x="11" y="11" width="242" height="448" fill="#000" />
        <text x="24" y="32" fontSize="10.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">9:41</text>
        <rect x="96" y="16" width="72" height="18" rx="9" fill="#18181b" />
        <rect x="218" y="24" width="20" height="10" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.1" strokeOpacity="0.7" />
        <rect x="238" y="27" width="2" height="4" rx="1" fill="#fff" fillOpacity="0.4" />
        <rect x="219.5" y="25.5" width="13" height="7" rx="1.5" fill="#fff" fillOpacity="0.85" />
        <rect x="197" y="29" width="3" height="5" rx="0.8" fill="#fff" fillOpacity="0.4" />
        <rect x="202" y="27" width="3" height="7" rx="0.8" fill="#fff" fillOpacity="0.6" />
        <rect x="207" y="25" width="3" height="9" rx="0.8" fill="#fff" fillOpacity="0.85" />
        {children}
      </g>
    </svg>
  );
}

function NavBar({ title, back, rightLabel }: { title: string; back?: string; rightLabel?: string }) {
  return (
    <>
      <rect x="11" y="44" width="242" height="42" fill="#000" />
      {back && <text x="22" y="69" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">‹ {back}</text>}
      <text x="132" y="69" textAnchor="middle" fontSize="14" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">{title}</text>
      {rightLabel && <text x="242" y="69" textAnchor="end" fontSize="13" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">{rightLabel}</text>}
      <rect x="11" y="86" width="242" height="0.5" fill="#2a2a2e" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Result preview: select price text → share → Budger logs it
// ─────────────────────────────────────────────────────────────────────────────
function Mockup1() {
  return (
    <Phone id="ss1">
      {/* Safari-style address bar */}
      <rect x="11" y="44" width="242" height="50" fill="#111" />
      <rect x="22" y="54" width="220" height="28" rx="9" fill="#1c1c1e" />
      <text x="132" y="73" textAnchor="middle" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">shop.example.com</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />

      {/* Webpage content */}
      <rect x="11" y="95" width="242" height="200" fill="#111" />
      <text x="24" y="120" fontSize="11" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Order Confirmation</text>
      <text x="24" y="145" fontSize="14" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Morning Latte</text>
      <text x="24" y="163" fontSize="11" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">1 × Oat milk, medium</text>

      {/* Price text — selected / highlighted */}
      <rect x="22" y="176" width="66" height="22" rx="5" fill="#0a84ff" fillOpacity="0.35" />
      <text x="55" y="191" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">€4.80</text>
      {/* Selection handles */}
      <circle cx="22" cy="187" r="4" fill="#0a84ff" />
      <circle cx="88" cy="187" r="4" fill="#0a84ff" />
      <rect x="22" y="175.5" width="66" height="1" fill="#0a84ff" />
      <rect x="22" y="198.5" width="66" height="1" fill="#0a84ff" />

      {/* Callout: Share */}
      <rect x="22" y="205" width="44" height="20" rx="5" fill="#2c2c2e" stroke="#3a3a3e" strokeWidth="0.8" />
      <text x="44" y="218" textAnchor="middle" fontSize="9.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Share</text>

      {/* Bottom share sheet */}
      <rect x="11" y="290" width="242" height="169" rx="0" fill="#1c1c1e" />
      <rect x="96" y="296" width="72" height="4" rx="2" fill="#3a3a3e" />

      {/* App row */}
      <text x="24" y="317" fontSize="10" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Share via Shortcuts</text>
      {/* Highlighted: Send To Budger */}
      <rect x="14" y="324" width="236" height="44" rx="10" fill="#0a84ff" fillOpacity="0.13" stroke="#0a84ff" strokeWidth="0.7" />
      <rect x="24" y="335" width="28" height="22" rx="7" fill="#30d158" />
      <text x="38" y="350" textAnchor="middle" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">⚡</text>
      <text x="60" y="351" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Send To Budger</text>
      <rect x="11" y="370" width="242" height="0.5" fill="#2e2e32" />
      <text x="24" y="390" fontSize="12" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Copy</text>
      <rect x="11" y="400" width="242" height="0.5" fill="#2e2e32" />
      <text x="24" y="420" fontSize="12" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Look Up</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Shortcuts app, My Shortcuts tab, tap +
// ─────────────────────────────────────────────────────────────────────────────
function Mockup2() {
  return (
    <Phone id="ss2">
      <rect x="11" y="44" width="242" height="54" fill="#000" />
      <text x="24" y="84" fontSize="24" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Shortcuts</text>

      {/* + button */}
      <circle cx="240" cy="72" r="16" fill="#0a84ff" fillOpacity="0.15" />
      <text x="240" y="78" textAnchor="middle" fontSize="22" fontWeight="300" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+</text>
      <circle cx="240" cy="72" r="20" fill="none" stroke="#0a84ff" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 2" />

      <rect x="11" y="98" width="242" height="0.5" fill="#2a2a2e" />

      {/* Existing shortcut thumbnails — faded */}
      <rect x="16" y="110" width="105" height="90" rx="16" fill="#1c1c1e" opacity="0.5" />
      <rect x="143" y="110" width="105" height="90" rx="16" fill="#1c1c1e" opacity="0.3" />
      <rect x="16" y="210" width="105" height="90" rx="16" fill="#1c1c1e" opacity="0.2" />
      <rect x="143" y="210" width="105" height="90" rx="16" fill="#1c1c1e" opacity="0.15" />

      {/* Bottom tab bar */}
      <rect x="11" y="416" width="242" height="0.5" fill="#2a2a2e" />
      <rect x="11" y="416" width="242" height="43" fill="#0d0d0d" />
      {/* My Shortcuts — active */}
      <rect x="28" y="422" width="16" height="12" rx="2" fill="#0a84ff" />
      <rect x="32" y="418" width="8" height="4" rx="1" fill="#0a84ff" />
      <text x="36" y="451" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Shortcuts</text>
      {/* Automation tab */}
      <circle cx="132" cy="430" r="8" fill="none" stroke="#3a3a3e" strokeWidth="1.8" />
      <line x1="132" y1="424" x2="132" y2="430" stroke="#3a3a3e" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="132" y1="430" x2="137" y2="433" stroke="#3a3a3e" strokeWidth="1.6" strokeLinecap="round" />
      <text x="132" y="451" textAnchor="middle" fontSize="8.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Automation</text>
      {/* Gallery tab */}
      <rect x="214" y="422" width="16" height="16" rx="2" fill="none" stroke="#3a3a3e" strokeWidth="1.4" />
      <line x1="220" y1="422" x2="220" y2="438" stroke="#3a3a3e" strokeWidth="1" />
      <line x1="214" y1="430" x2="230" y2="430" stroke="#3a3a3e" strokeWidth="1" />
      <text x="222" y="451" textAnchor="middle" fontSize="8.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Gallery</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Name it "Send To Budger" + add Receive Text from Share Sheet
// ─────────────────────────────────────────────────────────────────────────────
function Mockup3() {
  return (
    <Phone id="ss3">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Shortcut name chip */}
      <rect x="68" y="96" width="128" height="30" rx="15" fill="#1c1c1e" stroke="#3a3a3e" strokeWidth="0.8" />
      <text x="132" y="116" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Send To Budger</text>

      <rect x="11" y="136" width="242" height="0.5" fill="#2a2a2e" />

      {/* Receive Text from Share Sheet — highlighted action card */}
      <rect x="14" y="146" width="236" height="80" rx="14" fill="#1c1c1e" stroke="#0a84ff" strokeWidth="0.9" strokeOpacity="0.6" />
      {/* Action icon */}
      <rect x="22" y="158" width="28" height="28" rx="8" fill="#0a84ff" opacity="0.85" />
      <text x="36" y="176" textAnchor="middle" fontSize="13" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">↙</text>
      <text x="58" y="167" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Receive</text>
      <text x="58" y="181" fontSize="10.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Text</text>
      <text x="98" y="181" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">from</text>
      <text x="120" y="181" fontSize="10.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Share Sheet</text>
      {/* If no input line */}
      <rect x="14" y="210" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="227" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">If there's no input:</text>
      <text x="152" y="227" fontSize="10" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Continue</text>

      {/* Add action prompt */}
      <rect x="14" y="240" width="236" height="0.5" fill="#2a2a2e" />
      <rect x="68" y="260" width="128" height="32" rx="16" fill="#1c1c1e" stroke="#2a2a2e" strokeWidth="0.8" />
      <text x="132" y="280" textAnchor="middle" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add Action</text>

      {/* Search bar at bottom */}
      <rect x="16" y="310" width="232" height="32" rx="10" fill="#1c1c1e" />
      <text x="132" y="330" textAnchor="middle" fontSize="11" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Search actions…</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Search "Get Contents of URL" and add it
// ─────────────────────────────────────────────────────────────────────────────
function Mockup4() {
  return (
    <Phone id="ss4">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Search bar */}
      <rect x="16" y="94" width="232" height="32" rx="10" fill="#1c1c1e" />
      <text x="50" y="115" fontSize="11.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>
      <rect x="34" y="103" width="10" height="10" rx="2" fill="#636368" opacity="0.4" />
      <rect x="220" y="103" width="14" height="14" rx="7" fill="#3a3a3e" />
      <text x="227" y="113" textAnchor="middle" fontSize="9" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">✕</text>
      <rect x="11" y="130" width="242" height="0.5" fill="#1e1e22" />

      {/* Result row — highlighted */}
      <rect x="11" y="131" width="242" height="60" fill="#0a84ff" fillOpacity="0.08" />
      <rect x="20" y="145" width="30" height="30" rx="8" fill="#0a84ff" opacity="0.85" />
      <text x="35" y="163" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">↗</text>
      <text x="58" y="160" fontSize="13" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>
      <text x="58" y="175" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Web · Networking</text>
      <rect x="11" y="191" width="242" height="0.5" fill="#1e1e22" />

      {/* Dimmed second result */}
      <rect x="20" y="203" width="30" height="30" rx="8" fill="#2a2a2e" opacity="0.4" />
      <text x="58" y="221" fontSize="13" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">Get File</text>
      <rect x="11" y="245" width="242" height="0.5" fill="#1e1e22" />

      <text x="132" y="285" textAnchor="middle" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Tap to add it to your shortcut</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — Configured action: POST · JSON · transaction → Shortcut Input · Show Notification
// ─────────────────────────────────────────────────────────────────────────────
function Mockup5() {
  return (
    <Phone id="ss5">
      <NavBar title="Send To Budger" back="Shortcuts" rightLabel="Done" />

      {/* Receive Text block — compact / faded */}
      <rect x="14" y="95" width="236" height="36" rx="10" fill="#1c1c1e" opacity="0.55" />
      <rect x="22" y="107" width="20" height="20" rx="6" fill="#0a84ff" opacity="0.6" />
      <text x="50" y="118" fontSize="10.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Receive Text from Share Sheet</text>

      {/* Get Contents of URL — main action */}
      <rect x="14" y="140" width="236" height="175" rx="14" fill="#1c1c1e" />

      {/* Action header */}
      <rect x="14" y="140" width="236" height="34" rx="14" fill="#272729" />
      <rect x="14" y="156" width="236" height="18" fill="#272729" />
      <rect x="20" y="152" width="20" height="14" rx="4" fill="#0a84ff" opacity="0.85" />
      <text x="48" y="162" fontSize="11.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>

      {/* URL field */}
      <rect x="14" y="176" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="192" fontSize="9.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">URL</text>
      <rect x="46" y="181" width="196" height="20" rx="6" fill="#0a84ff" fillOpacity="0.10" stroke="#0a84ff" strokeWidth="0.6" />
      <text x="54" y="195" fontSize="8.5" fill="#4da3ff" fontFamily="-apple-system,system-ui,sans-serif">https://budger.app/api/webhook/…</text>

      {/* Method */}
      <rect x="14" y="203" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="221" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Method</text>
      <rect x="192" y="211" width="36" height="18" rx="9" fill="#0a84ff" fillOpacity="0.2" stroke="#0a84ff" strokeWidth="0.6" />
      <text x="210" y="223" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">POST</text>

      {/* Body JSON */}
      <rect x="14" y="231" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="249" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Request Body</text>
      <rect x="188" y="239" width="40" height="18" rx="9" fill="#30d158" fillOpacity="0.15" stroke="#30d158" strokeWidth="0.6" />
      <text x="208" y="251" textAnchor="middle" fontSize="9" fontWeight="700" fill="#30d158" fontFamily="-apple-system,system-ui,sans-serif">JSON</text>

      {/* transaction → Shortcut Input */}
      <rect x="14" y="259" width="236" height="0.5" fill="#2e2e32" />
      <rect x="18" y="265" width="80" height="22" rx="7" fill="#2a2a2e" />
      <text x="58" y="280" textAnchor="middle" fontSize="10.5" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">transaction</text>
      <rect x="104" y="265" width="102" height="22" rx="11" fill="#0a84ff" />
      <text x="155" y="280" textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Shortcut Input</text>

      {/* Add field */}
      <rect x="14" y="289" width="236" height="0.5" fill="#2e2e32" />
      <text x="132" y="308" textAnchor="middle" fontSize="10" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add field</text>

      {/* Show Notification block */}
      <rect x="14" y="326" width="236" height="36" rx="10" fill="#1c1c1e" />
      <rect x="22" y="337" width="20" height="15" rx="4" fill="#ff453a" opacity="0.85" />
      <text x="50" y="349" fontSize="10.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Show notification · </text>
      <text x="152" y="349" fontSize="10.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Captured ✓</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy link button
// ─────────────────────────────────────────────────────────────────────────────
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      className={`w-full py-3 rounded-2xl font-semibold text-[13px] tracking-tight transition-all active:scale-95 ${
        copied
          ? "bg-green-500/15 border border-green-500/30 text-green-400"
          : "bg-foreground text-background"
      }`}
    >
      {copied ? `✓ ${t("ap.copied")}` : t("ap.copy_link")}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slides registry
// ─────────────────────────────────────────────────────────────────────────────
const SLIDES = [
  { mockup: <Mockup1 />, titleKey: "ss.s1_title", descKey: "ss.s1_desc" },
  { mockup: <Mockup2 />, titleKey: "ss.s2_title", descKey: "ss.s2_desc" },
  { mockup: <Mockup3 />, titleKey: "ss.s3_title", descKey: "ss.s3_desc" },
  { mockup: <Mockup4 />, titleKey: "ss.s4_title", descKey: "ss.s4_desc" },
  { mockup: <Mockup5 />, titleKey: "ss.s5_title", descKey: "ss.s5_desc" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
interface ShareSheetSlidesProps {
  onDone?: () => void;
  onClose?: () => void;
  modal?: boolean;
}

export default function ShareSheetSlides({ onDone, onClose, modal = false }: ShareSheetSlidesProps) {
  const [idx, setIdx] = useState(0);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/webhook/token`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.token) {
          setWebhookUrl(`${window.location.origin}/api/webhook/apple/${data.token}`);
        }
      })
      .catch(() => {});
  }, []);

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
            {t("ss.setup_title")}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {t("ap.step_of", { n: idx + 1, total })}
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
          aria-label={t("ap.prev")}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
        <button
          onClick={goNext}
          className="absolute inset-y-0 right-0 w-1/2 z-10"
          aria-label={t("ap.next")}
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

          {/* Dots */}
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

          {/* Hint slot */}
          <div className="h-5 flex items-center justify-center flex-shrink-0 mt-2">
            {idx === 0 && (
              <p className="text-[9px] text-muted-foreground/35 tracking-widest uppercase">
                {t("ap.tap_hint")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── URL copy section — only on last slide ── */}
      {isLast && (
        <div className="flex-shrink-0 pb-1">
          {webhookUrl ? (
            <CopyLinkButton url={webhookUrl} />
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 bg-card border border-border rounded-2xl">
              <div className="w-3 h-3 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">{t("ap.generating")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!modal) return inner;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col px-5 pt-12 pb-8">
      {inner}
    </div>
  );
}
