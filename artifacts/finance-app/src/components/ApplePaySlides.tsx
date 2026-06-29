import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// iPhone frame — minimal, professional
// ─────────────────────────────────────────────────────────────────────────────

function Phone({ id, children }: { id: string; children: React.ReactNode }) {
  const clip = `ap-clip-${id}`;
  return (
    <svg viewBox="0 0 264 470" className="w-full max-w-[155px] mx-auto" style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.55))" }}>
      <defs>
        <clipPath id={clip}>
          <rect x="11" y="11" width="242" height="448" rx="28" />
        </clipPath>
      </defs>
      {/* Body */}
      <rect x="0" y="0" width="264" height="470" rx="36" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />
      {/* Power button */}
      <rect x="262" y="108" width="2.5" height="52" rx="1.2" fill="#27272a" />
      {/* Volume buttons */}
      <rect x="0" y="92" width="2.5" height="30" rx="1.2" fill="#27272a" />
      <rect x="0" y="132" width="2.5" height="48" rx="1.2" fill="#27272a" />
      {/* Screen glass */}
      <rect x="11" y="11" width="242" height="448" rx="28" fill="#000" />
      <g clipPath={`url(#${clip})`}>
        {/* Base fill */}
        <rect x="11" y="11" width="242" height="448" fill="#000" />
        {/* Status bar */}
        <text x="24" y="32" fontSize="10.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">9:41</text>
        {/* Dynamic island */}
        <rect x="96" y="16" width="72" height="18" rx="9" fill="#18181b" />
        {/* Battery */}
        <rect x="218" y="24" width="20" height="10" rx="2.5" fill="none" stroke="#fff" strokeWidth="1.1" strokeOpacity="0.7" />
        <rect x="238" y="27" width="2" height="4" rx="1" fill="#fff" fillOpacity="0.4" />
        <rect x="219.5" y="25.5" width="13" height="7" rx="1.5" fill="#fff" fillOpacity="0.85" />
        {/* Signal bars */}
        <rect x="197" y="29" width="3" height="5" rx="0.8" fill="#fff" fillOpacity="0.4" />
        <rect x="202" y="27" width="3" height="7" rx="0.8" fill="#fff" fillOpacity="0.6" />
        <rect x="207" y="25" width="3" height="9" rx="0.8" fill="#fff" fillOpacity="0.85" />
        {children}
      </g>
    </svg>
  );
}

// Shared primitives
function NavBar({ title, back, rightLabel }: { title: string; back?: string; rightLabel?: string }) {
  return (
    <>
      <rect x="11" y="44" width="242" height="42" fill="#000" />
      {back && (
        <text x="22" y="69" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">‹ {back}</text>
      )}
      <text x="132" y="69" textAnchor="middle" fontSize="14" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">{title}</text>
      {rightLabel && (
        <text x="242" y="69" textAnchor="end" fontSize="13" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">{rightLabel}</text>
      )}
      <rect x="11" y="86" width="242" height="0.5" fill="#2a2a2e" />
    </>
  );
}

function Row({
  y, label, sub, value, highlight, check, chevron, pill, pillColor,
}: {
  y: number; label: string; sub?: string; value?: string;
  highlight?: boolean; check?: boolean; chevron?: boolean;
  pill?: string; pillColor?: string;
}) {
  const h = sub ? 52 : 42;
  return (
    <>
      {highlight && (
        <rect x="16" y={y} width="232" height={h} rx="11" fill="#0a84ff" fillOpacity="0.12" stroke="#0a84ff" strokeWidth="0.8" strokeOpacity="0.5" />
      )}
      <text x="28" y={y + (sub ? 20 : h / 2 + 5)} fontSize="13" fontWeight={highlight ? "500" : "400"} fill={highlight ? "#fff" : "#ebebf0"} fontFamily="-apple-system,system-ui,sans-serif">{label}</text>
      {sub && <text x="28" y={y + 36} fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">{sub}</text>}
      {value && <text x="242" y={y + h / 2 + 5} textAnchor="end" fontSize="12" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">{value}</text>}
      {check && <text x="242" y={y + h / 2 + 5} textAnchor="end" fontSize="14" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">✓</text>}
      {chevron && <text x="243" y={y + h / 2 + 5} textAnchor="end" fontSize="12" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">›</text>}
      {pill && (
        <>
          <rect x={pillColor === "green" ? 188 : 194} y={y + h / 2 - 10} width={pillColor === "green" ? 44 : 38} height="20" rx="10" fill={pillColor === "green" ? "#30d158" : "#0a84ff"} fillOpacity="0.2" stroke={pillColor === "green" ? "#30d158" : "#0a84ff"} strokeWidth="0.6" />
          <text x={pillColor === "green" ? 210 : 213} y={y + h / 2 + 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={pillColor === "green" ? "#30d158" : "#0a84ff"} fontFamily="-apple-system,system-ui,sans-serif">{pill}</text>
        </>
      )}
      <rect x="11" y={y + h} width="242" height="0.5" fill="#1e1e22" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Result preview: Budger auto-logged transaction
// ─────────────────────────────────────────────────────────────────────────────
function Mockup1() {
  return (
    <Phone id="s1">
      {/* App header */}
      <rect x="11" y="44" width="242" height="50" fill="#000" />
      <text x="24" y="80" fontSize="22" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Spending</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />

      {/* Auto-logged badge */}
      <rect x="78" y="102" width="108" height="22" rx="11" fill="#0a84ff" fillOpacity="0.14" />
      <text x="132" y="117" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a84ff" letterSpacing="0.3" fontFamily="-apple-system,system-ui,sans-serif">⚡  AUTO-LOGGED</text>

      {/* New transaction — highlighted */}
      <rect x="16" y="132" width="232" height="64" rx="14" fill="#1c1c1e" stroke="#0a84ff" strokeWidth="0.9" strokeOpacity="0.5" />
      {/* Card icon */}
      <rect x="28" y="148" width="34" height="24" rx="7" fill="#0a84ff" opacity="0.9" />
      <rect x="28" y="154" width="34" height="5" fill="#0055d4" opacity="0.6" />
      <text x="45" y="163" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">PAY</text>
      {/* Details */}
      <text x="72" y="155" fontSize="13.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Starbucks</text>
      <text x="72" y="171" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Just now · Café</text>
      <text x="240" y="155" textAnchor="end" fontSize="13.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">−$4.85</text>
      {/* Apple Pay chip */}
      <rect x="178" y="163" width="60" height="14" rx="7" fill="#0a84ff" fillOpacity="0.16" />
      <text x="208" y="173" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">APPLE PAY</text>

      {/* Older rows — faded */}
      <rect x="16" y="204" width="232" height="56" rx="14" fill="#1c1c1e" opacity="0.38" />
      <rect x="28" y="218" width="34" height="24" rx="7" fill="#3a3a3e" opacity="0.5" />
      <text x="72" y="238" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.55">IKEA</text>
      <text x="240" y="238" textAnchor="end" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.55">−$89.00</text>

      <rect x="16" y="268" width="232" height="56" rx="14" fill="#1c1c1e" opacity="0.2" />
      <rect x="28" y="282" width="34" height="24" rx="7" fill="#3a3a3e" opacity="0.3" />
      <text x="72" y="302" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.3">Amazon</text>
      <text x="240" y="302" textAnchor="end" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.3">−$24.99</text>

      {/* Bottom nav */}
      <rect x="11" y="416" width="242" height="0.5" fill="#2a2a2e" />
      <rect x="11" y="416" width="242" height="43" fill="#0d0d0d" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Shortcuts app: Automation tab, + button
// ─────────────────────────────────────────────────────────────────────────────
function Mockup2() {
  return (
    <Phone id="s2">
      {/* Large title */}
      <rect x="11" y="44" width="242" height="54" fill="#000" />
      <text x="24" y="84" fontSize="24" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Automation</text>

      {/* + button with glow */}
      <circle cx="240" cy="72" r="16" fill="#0a84ff" fillOpacity="0.15" />
      <text x="240" y="78" textAnchor="middle" fontSize="22" fontWeight="300" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+</text>
      {/* Tap indicator */}
      <circle cx="240" cy="72" r="20" fill="none" stroke="#0a84ff" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 2" />

      <rect x="11" y="98" width="242" height="0.5" fill="#2a2a2e" />

      {/* Empty state */}
      <circle cx="132" cy="200" r="40" fill="#111" />
      <circle cx="132" cy="200" r="22" fill="none" stroke="#3a3a3e" strokeWidth="2.5" />
      <line x1="132" y1="190" x2="132" y2="200" stroke="#3a3a3e" strokeWidth="2" strokeLinecap="round" />
      <line x1="132" y1="200" x2="142" y2="206" stroke="#3a3a3e" strokeWidth="2" strokeLinecap="round" />

      <text x="132" y="258" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">No Automations</text>
      <text x="132" y="276" textAnchor="middle" fontSize="11.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Tap + to create one</text>

      {/* Bottom tab bar */}
      <rect x="11" y="416" width="242" height="0.5" fill="#2a2a2e" />
      <rect x="11" y="416" width="242" height="43" fill="#0d0d0d" />
      {/* Shortcuts tab */}
      <rect x="36" y="424" width="16" height="12" rx="2" fill="#3a3a3e" />
      <rect x="40" y="420" width="8" height="4" rx="1" fill="#3a3a3e" />
      <text x="44" y="451" textAnchor="middle" fontSize="8.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Shortcuts</text>
      {/* Automation tab — active */}
      <circle cx="132" cy="430" r="8" fill="none" stroke="#0a84ff" strokeWidth="1.8" />
      <line x1="132" y1="424" x2="132" y2="430" stroke="#0a84ff" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="132" y1="430" x2="137" y2="433" stroke="#0a84ff" strokeWidth="1.6" strokeLinecap="round" />
      <text x="132" y="451" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Automation</text>
      {/* Gallery tab */}
      <rect x="214" y="422" width="16" height="16" rx="2" fill="none" stroke="#3a3a3e" strokeWidth="1.4" />
      <line x1="220" y1="422" x2="220" y2="438" stroke="#3a3a3e" strokeWidth="1" />
      <line x1="214" y1="430" x2="230" y2="430" stroke="#3a3a3e" strokeWidth="1" />
      <text x="222" y="451" textAnchor="middle" fontSize="8.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Gallery</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Trigger list: tap Wallet
// ─────────────────────────────────────────────────────────────────────────────
function Mockup3() {
  return (
    <Phone id="s3">
      <NavBar title="New Automation" back="Automation" />

      <text x="24" y="106" fontSize="10" fontWeight="600" fill="#636368" letterSpacing="0.6" fontFamily="-apple-system,system-ui,sans-serif">CHOOSE A TRIGGER</text>

      {/* Trigger rows */}
      <rect x="11" y="114" width="242" height="0.5" fill="#1e1e22" />
      <Row y={114.5} label="App" sub="When an app is opened" chevron />
      <Row y={167} label="Time of Day" sub="At a scheduled time" chevron />
      {/* Wallet — highlighted */}
      <rect x="11" y={219.5} width="242" height="52" fill="#0a84ff" fillOpacity="0.10" />
      <rect x="11" y={219.5} width="3" height="52" fill="#0a84ff" />
      <text x="28" y="245" fontSize="13" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Wallet</text>
      <text x="28" y="260" fontSize="10.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Whenever I tap my card</text>
      <text x="243" y="249" textAnchor="end" fontSize="14" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">›</text>
      <rect x="11" y="271" width="242" height="0.5" fill="#1e1e22" />
      <Row y={272} label="Location" sub="When arriving somewhere" chevron />
      <Row y={324} label="Communication" sub="Email, message, phone" chevron />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Card selection + Run Immediately
// ─────────────────────────────────────────────────────────────────────────────
function Mockup4() {
  return (
    <Phone id="s4">
      <NavBar title="Wallet" back="Back" rightLabel="Next" />

      <text x="24" y="104" fontSize="10" fontWeight="600" fill="#636368" letterSpacing="0.6" fontFamily="-apple-system,system-ui,sans-serif">WHENEVER I TAP</text>
      <rect x="11" y="110" width="242" height="0.5" fill="#1e1e22" />

      {/* Card row — selected */}
      <rect x="11" y="110" width="242" height="50" fill="#000" />
      <rect x="22" y="120" width="28" height="20" rx="5" fill="#0a84ff" />
      <rect x="22" y="126" width="28" height="5" fill="#0055d4" opacity="0.6" />
      <text x="58" y="134" fontSize="12.5" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Visa ···· 4242</text>
      <text x="243" y="134" textAnchor="end" fontSize="14" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">✓</text>
      <rect x="11" y="160" width="242" height="0.5" fill="#1e1e22" />

      {/* Second card — unchecked, faded */}
      <rect x="11" y="160" width="242" height="50" fill="#000" />
      <rect x="22" y="170" width="28" height="20" rx="5" fill="#2a2a2e" />
      <text x="58" y="184" fontSize="12.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Mastercard ···· 8801</text>
      <rect x="11" y="210" width="242" height="0.5" fill="#1e1e22" />

      <text x="24" y="232" fontSize="10" fontWeight="600" fill="#636368" letterSpacing="0.6" fontFamily="-apple-system,system-ui,sans-serif">WHEN TO RUN</text>
      <rect x="11" y="238" width="242" height="0.5" fill="#1e1e22" />

      {/* Run Immediately — selected */}
      <rect x="11" y="238" width="242" height="46" fill="#000" />
      <circle cx="30" cy="261" r="9" fill="#0a84ff" />
      <circle cx="30" cy="261" r="4" fill="#fff" />
      <text x="48" y="265" fontSize="13" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Run Immediately</text>
      <rect x="11" y="284" width="242" height="0.5" fill="#1e1e22" />

      {/* Ask Before Running — unselected */}
      <rect x="11" y="284" width="242" height="46" fill="#000" />
      <circle cx="30" cy="307" r="9" fill="none" stroke="#3a3a3e" strokeWidth="1.8" />
      <text x="48" y="311" fontSize="13" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Ask Before Running</text>
      <rect x="11" y="330" width="242" height="0.5" fill="#1e1e22" />

      {/* Next button */}
      <rect x="28" y="348" width="208" height="38" rx="13" fill="#0a84ff" />
      <text x="132" y="371" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Next</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — "New Blank Automation" → search "Get Contents of URL"
// ─────────────────────────────────────────────────────────────────────────────
function Mockup5() {
  return (
    <Phone id="s5">
      <NavBar title="New Automation" back="Back" />

      {/* Search bar */}
      <rect x="16" y="94" width="232" height="32" rx="10" fill="#1c1c1e" />
      <text x="132" y="115" textAnchor="middle" fontSize="11.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>
      {/* Cursor blink */}
      <rect x="216" y="103" width="1.5" height="14" rx="0.7" fill="#0a84ff" />

      <rect x="11" y="132" width="242" height="0.5" fill="#1e1e22" />

      {/* Search result — highlighted */}
      <rect x="11" y="132" width="242" height="60" fill="#0a84ff" fillOpacity="0.08" />
      {/* URL icon */}
      <rect x="20" y="146" width="30" height="30" rx="8" fill="#0a84ff" opacity="0.85" />
      <text x="35" y="164" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">↗</text>
      <text x="58" y="160" fontSize="13" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>
      <text x="58" y="176" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Web · Networking</text>
      <rect x="11" y="192" width="242" height="0.5" fill="#1e1e22" />

      {/* Dimmed second result */}
      <rect x="11" y="192" width="242" height="54" fill="#000" opacity="0.5" />
      <rect x="20" y="204" width="30" height="30" rx="8" fill="#2a2a2e" opacity="0.4" />
      <text x="58" y="222" fontSize="13" fill="#3a3a3e" fontFamily="-apple-system,system-ui,sans-serif">Get File</text>
      <rect x="11" y="246" width="242" height="0.5" fill="#1e1e22" />

      {/* Tap label */}
      <text x="132" y="290" textAnchor="middle" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Tap the result to add it</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — Action configured: POST · JSON · transaction · Shortcut Input
// ─────────────────────────────────────────────────────────────────────────────
function Mockup6() {
  return (
    <Phone id="s6">
      <NavBar title="New Automation" back="Transaction" rightLabel="Done" />

      {/* Action card */}
      <rect x="14" y="95" width="236" height="248" rx="16" fill="#1c1c1e" />

      {/* Action header */}
      <rect x="14" y="95" width="236" height="36" rx="16" fill="#272729" />
      <rect x="14" y="112" width="236" height="20" fill="#272729" />
      <rect x="20" y="108" width="22" height="14" rx="4" fill="#0a84ff" opacity="0.85" />
      <text x="50" y="118" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>

      {/* URL field — highlighted */}
      <rect x="14" y="131" width="236" height="0.5" fill="#2e2e32" />
      <text x="24" y="149" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">URL</text>
      <rect x="52" y="136" width="190" height="24" rx="7" fill="#0a84ff" fillOpacity="0.10" stroke="#0a84ff" strokeWidth="0.7" />
      <text x="60" y="152" fontSize="9.5" fill="#4da3ff" fontFamily="-apple-system,system-ui,sans-serif">https://budger.app/api/webhook/…</text>

      {/* Method */}
      <rect x="14" y="162" width="236" height="0.5" fill="#2e2e32" />
      <text x="24" y="182" fontSize="12" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Method</text>
      <rect x="194" y="171" width="38" height="20" rx="10" fill="#0a84ff" fillOpacity="0.2" stroke="#0a84ff" strokeWidth="0.6" />
      <text x="213" y="185" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">POST</text>

      {/* Body type */}
      <rect x="14" y="194" width="236" height="0.5" fill="#2e2e32" />
      <text x="24" y="214" fontSize="12" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Request Body</text>
      <rect x="190" y="203" width="44" height="20" rx="10" fill="#30d158" fillOpacity="0.15" stroke="#30d158" strokeWidth="0.6" />
      <text x="212" y="217" textAnchor="middle" fontSize="10" fontWeight="700" fill="#30d158" fontFamily="-apple-system,system-ui,sans-serif">JSON</text>

      {/* Key / Value headers */}
      <rect x="14" y="226" width="236" height="0.5" fill="#2e2e32" />
      <text x="24" y="242" fontSize="9.5" fontWeight="600" fill="#636368" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">KEY</text>
      <text x="142" y="242" fontSize="9.5" fontWeight="600" fill="#636368" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">VALUE</text>

      {/* Key: transaction */}
      <rect x="18" y="248" width="112" height="24" rx="8" fill="#2a2a2e" />
      <text x="74" y="264" textAnchor="middle" fontSize="11.5" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">transaction</text>

      {/* Value: Shortcut Input chip */}
      <rect x="138" y="248" width="104" height="24" rx="12" fill="#0a84ff" />
      <text x="190" y="264" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Shortcut Input</text>

      {/* Add field */}
      <rect x="14" y="274" width="236" height="0.5" fill="#2e2e32" />
      <text x="132" y="300" textAnchor="middle" fontSize="11.5" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add field</text>
      <rect x="14" y="342" width="236" height="0.5" fill="#2e2e32" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy link button (rendered outside the card on last slide)
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
  { mockup: <Mockup1 />, titleKey: "ap.s1_title", descKey: "ap.s1_desc" },
  { mockup: <Mockup2 />, titleKey: "ap.s2_title", descKey: "ap.s2_desc" },
  { mockup: <Mockup3 />, titleKey: "ap.s3_title", descKey: "ap.s3_desc" },
  { mockup: <Mockup4 />, titleKey: "ap.s4_title", descKey: "ap.s4_desc" },
  { mockup: <Mockup5 />, titleKey: "ap.s5_title", descKey: "ap.s5_desc" },
  { mockup: <Mockup6 />, titleKey: "ap.s6_title", descKey: "ap.s6_desc" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
interface ApplePaySlidesProps {
  onDone?: () => void;
  onClose?: () => void;
  modal?: boolean;
}

export default function ApplePaySlides({ onDone, onClose, modal = false }: ApplePaySlidesProps) {
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
            {t("ap.setup_title")}
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

      {/* ── Slide card — fixed height sized to last (most text-heavy) slide ── */}
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

        {/* Content — full height, phone top · text middle · dots+hint pinned bottom */}
        <div className="pointer-events-none flex flex-col items-center w-full h-full px-4 pt-5 pb-4">

          {/* Phone mockup — fixed height */}
          <div className="flex items-center justify-center w-full overflow-hidden flex-shrink-0" style={{ height: 200 }}>
            {slide.mockup}
          </div>

          {/* Title + description — grows to fill space, centred vertically */}
          <div className="flex-1 flex flex-col items-center justify-center w-full gap-1 py-3">
            <h3 className="text-[13.5px] font-bold text-foreground text-center leading-snug">
              {t(slide.titleKey)}
            </h3>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {t(slide.descKey)}
            </p>
          </div>

          {/* Dots — always at bottom, fixed position */}
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

          {/* Hint slot — fixed 20px, always present to keep dots at same Y */}
          <div className="h-5 flex items-center justify-center flex-shrink-0 mt-2">
            {idx === 0 && (
              <p className="text-[9px] text-muted-foreground/35 tracking-widest uppercase">
                {t("ap.tap_hint")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── URL copy section — only on last slide, OUTSIDE the card ── */}
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
