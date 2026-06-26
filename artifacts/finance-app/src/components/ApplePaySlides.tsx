import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ── Phone frame wrapper ───────────────────────────────────────────────────────

function PhoneSVG({ id, children }: { id: string; children: React.ReactNode }) {
  const clip = `apc-${id}`;
  return (
    <svg viewBox="0 0 280 480" className="w-full max-w-[180px] mx-auto drop-shadow-2xl">
      <defs>
        <clipPath id={clip}>
          <rect x="14" y="14" width="252" height="452" rx="26" />
        </clipPath>
      </defs>
      {/* Phone body */}
      <rect x="1" y="1" width="278" height="478" rx="36" fill="#1c1c1e" stroke="#3a3a3c" strokeWidth="2" />
      {/* Power button */}
      <rect x="279" y="118" width="3" height="58" rx="1.5" fill="#3a3a3c" />
      {/* Volume buttons */}
      <rect x="0" y="98" width="3" height="34" rx="1.5" fill="#3a3a3c" />
      <rect x="0" y="142" width="3" height="54" rx="1.5" fill="#3a3a3c" />
      {/* Screen */}
      <rect x="14" y="14" width="252" height="452" rx="26" fill="#000" />
      <g clipPath={`url(#${clip})`}>
        <rect x="14" y="14" width="252" height="452" fill="#000" />
        {/* Dynamic island */}
        <rect x="110" y="20" width="60" height="16" rx="8" fill="#1c1c1e" />
        {/* Status time */}
        <text x="30" y="36" fontSize="12" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">9:41</text>
        {/* Signal / wifi / battery (simplified) */}
        <rect x="218" y="28" width="7" height="7" rx="1" fill="white" opacity="0.9" />
        <rect x="227" y="28" width="7" height="7" rx="1" fill="white" opacity="0.9" />
        <rect x="236" y="27" width="10" height="9" rx="2" fill="white" opacity="0.9" />
        <rect x="247" y="29" width="2" height="5" rx="1" fill="white" opacity="0.5" />
        {children}
      </g>
    </svg>
  );
}

// ── Status bar separator ──────────────────────────────────────────────────────

function NavBar({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <>
      <rect x="14" y="46" width="252" height="44" fill="#000" />
      {back && (
        <>
          <text x="30" y="72" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">‹</text>
          <text x="40" y="72" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">{back}</text>
        </>
      )}
      <text x="140" y="72" textAnchor="middle" fontSize="15" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">{title}</text>
      {right}
      <rect x="14" y="90" width="252" height="0.5" fill="#38383a" />
    </>
  );
}

// ── SLIDE 1 — Budger auto-logged transaction ──────────────────────────────────

function Mockup1() {
  return (
    <PhoneSVG id="s1">
      {/* App header bar */}
      <rect x="14" y="46" width="252" height="48" fill="#000" />
      <text x="28" y="74" fontSize="20" fontWeight="700" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Spending</text>
      {/* + button */}
      <circle cx="251" cy="70" r="13" fill="#1c1c1e" />
      <text x="251" y="75" textAnchor="middle" fontSize="20" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+</text>
      <rect x="14" y="94" width="252" height="0.5" fill="#38383a" />

      {/* ── AUTO badge at top ── */}
      <rect x="86" y="104" width="108" height="24" rx="12" fill="#0a84ff" fillOpacity="0.15" />
      <text x="140" y="120" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">⚡ Auto-logged</text>

      {/* ── Highlighted new transaction ── */}
      <rect x="22" y="136" width="236" height="68" rx="14" fill="#1c1c1e" stroke="#0a84ff" strokeWidth="1" strokeOpacity="0.6" />
      {/* Apple Pay icon block */}
      <rect x="34" y="150" width="38" height="38" rx="10" fill="#2c2c2e" />
      <text x="53" y="174" textAnchor="middle" fontSize="20" fontFamily="-apple-system,system-ui,sans-serif">󰉒</text>
      {/* Fallback: show stylised symbol */}
      <text x="53" y="175" textAnchor="middle" fontSize="13" fontWeight="700" fill="white" fontFamily="-apple-system,system-ui,sans-serif"></text>
      <rect x="37" y="153" width="32" height="32" rx="8" fill="#1a1a1a" />
      <text x="53" y="173" textAnchor="middle" fontSize="16" fill="white" fontFamily="serif">⬛</text>
      {/* Clean Apple Pay mark approximation */}
      <rect x="37" y="153" width="32" height="32" rx="8" fill="#1a1a1a" />
      <text x="53" y="173" textAnchor="middle" fontSize="11" fontWeight="800" fill="white" letterSpacing="-0.5" fontFamily="-apple-system,system-ui,sans-serif"> Pay</text>

      {/* Merchant + meta */}
      <text x="82" y="162" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Starbucks</text>
      <text x="82" y="178" fontSize="11" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Just now · Uncategorised</text>
      {/* Amount */}
      <text x="248" y="162" textAnchor="end" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">−$4.85</text>
      {/* Apple Pay small badge */}
      <rect x="196" y="172" width="50" height="14" rx="7" fill="#0a84ff" fillOpacity="0.18" />
      <text x="221" y="182" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">APPLE PAY</text>

      {/* ── Older transactions, faded ── */}
      <rect x="22" y="212" width="236" height="60" rx="14" fill="#1c1c1e" opacity="0.45" />
      <rect x="34" y="226" width="38" height="38" rx="10" fill="#2c2c2e" opacity="0.45" />
      <text x="82" y="242" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.45">IKEA</text>
      <text x="82" y="258" fontSize="11" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.45">Yesterday · Home</text>
      <text x="248" y="242" textAnchor="end" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.45">−$89.00</text>

      <rect x="22" y="280" width="236" height="60" rx="14" fill="#1c1c1e" opacity="0.25" />
      <rect x="34" y="294" width="38" height="38" rx="10" fill="#2c2c2e" opacity="0.25" />
      <text x="82" y="310" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.25">Amazon</text>
      <text x="82" y="326" fontSize="11" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.25">2 days ago · Shopping</text>
      <text x="248" y="310" textAnchor="end" fontSize="14" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.25">−$24.99</text>

      {/* Bottom nav bar */}
      <rect x="14" y="420" width="252" height="46" fill="#1a1a1a" />
      <rect x="14" y="420" width="252" height="0.5" fill="#38383a" />
    </PhoneSVG>
  );
}

// ── SLIDE 2 — Shortcuts → Automation tab ─────────────────────────────────────

function Mockup2() {
  return (
    <PhoneSVG id="s2">
      {/* Large title nav */}
      <rect x="14" y="46" width="252" height="54" fill="#000" />
      <text x="28" y="86" fontSize="26" fontWeight="700" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Automation</text>
      {/* + button - highlighted */}
      <circle cx="251" cy="78" r="15" fill="#0a84ff" fillOpacity="0.2" />
      <text x="251" y="84" textAnchor="middle" fontSize="22" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+</text>
      {/* Arrow pointing to + */}
      <line x1="220" y1="62" x2="240" y2="72" stroke="#0a84ff" strokeWidth="1.5" strokeDasharray="3,2" />
      <circle cx="220" cy="62" r="2.5" fill="#0a84ff" />

      <rect x="14" y="100" width="252" height="0.5" fill="#38383a" />

      {/* Empty state */}
      <circle cx="140" cy="200" r="36" fill="#1c1c1e" />
      {/* Clock/automation icon */}
      <circle cx="140" cy="200" r="20" fill="none" stroke="#636366" strokeWidth="2.5" />
      <line x1="140" y1="190" x2="140" y2="200" stroke="#636366" strokeWidth="2" strokeLinecap="round" />
      <line x1="140" y1="200" x2="149" y2="205" stroke="#636366" strokeWidth="2" strokeLinecap="round" />

      <text x="140" y="254" textAnchor="middle" fontSize="16" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">No Automations</text>
      <text x="140" y="274" textAnchor="middle" fontSize="12" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">Tap + to create one</text>

      {/* Bottom tab bar */}
      <rect x="14" y="420" width="252" height="46" fill="#1a1a1a" />
      <rect x="14" y="420" width="252" height="0.5" fill="#38383a" />
      {/* Tab 1: Shortcuts */}
      <text x="72" y="437" textAnchor="middle" fontSize="18" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">⊞</text>
      <text x="72" y="452" textAnchor="middle" fontSize="9" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">Shortcuts</text>
      {/* Tab 2: Automation - ACTIVE */}
      <text x="140" y="437" textAnchor="middle" fontSize="18" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">◷</text>
      <text x="140" y="452" textAnchor="middle" fontSize="9" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Automation</text>
      {/* Tab 3: Gallery */}
      <text x="208" y="437" textAnchor="middle" fontSize="18" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">⊞</text>
      <text x="208" y="452" textAnchor="middle" fontSize="9" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">Gallery</text>
    </PhoneSVG>
  );
}

// ── SLIDE 3 — Trigger: Wallet & Apple Pay → Transaction ──────────────────────

function Mockup3() {
  return (
    <PhoneSVG id="s3">
      <NavBar title="New Automation" back="Automation" />

      {/* Section: WALLET & APPLE PAY */}
      <text x="28" y="112" fontSize="11" fontWeight="600" fill="#8e8e93" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">WALLET &amp; APPLE PAY</text>

      {/* Transaction row — SELECTED / highlighted */}
      <rect x="22" y="120" width="236" height="46" rx="12" fill="#0a84ff" fillOpacity="0.12" stroke="#0a84ff" strokeWidth="1" strokeOpacity="0.4" />
      {/* Card icon */}
      <rect x="32" y="133" width="26" height="20" rx="4" fill="#0a84ff" />
      <rect x="32" y="138" width="26" height="4" fill="#0044bb" />
      {/* Label */}
      <text x="68" y="147" fontSize="14" fontWeight="500" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Transaction</text>
      {/* Checkmark */}
      <text x="246" y="148" textAnchor="end" fontSize="15" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">✓</text>

      {/* Other rows, faded */}
      <rect x="22" y="174" width="236" height="40" rx="12" fill="#1c1c1e" opacity="0.4" />
      <text x="68" y="199" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.6">Card Added</text>
      <rect x="22" y="220" width="236" height="40" rx="12" fill="#1c1c1e" opacity="0.25" />
      <text x="68" y="245" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif" opacity="0.4">Card Removed</text>

      <rect x="14" y="272" width="252" height="0.5" fill="#38383a" />

      {/* Run options card */}
      <text x="28" y="292" fontSize="11" fontWeight="600" fill="#8e8e93" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">WHEN TO RUN</text>

      <rect x="22" y="300" width="236" height="88" rx="14" fill="#1c1c1e" />
      {/* Run Immediately - selected */}
      <circle cx="38" cy="322" r="9" fill="#0a84ff" />
      <circle cx="38" cy="322" r="4" fill="white" />
      <text x="54" y="326" fontSize="13" fontWeight="500" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Run Immediately</text>
      <rect x="22" y="340" width="236" height="0.5" fill="#38383a" />
      {/* Ask Before Running - unselected */}
      <circle cx="38" cy="360" r="9" fill="none" stroke="#636366" strokeWidth="1.5" />
      <text x="54" y="364" fontSize="13" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Ask Before Running</text>

      <rect x="14" y="402" width="252" height="0.5" fill="#38383a" />
      {/* Notify when run row */}
      <rect x="22" y="408" width="236" height="40" rx="0" fill="transparent" />
      <text x="28" y="432" fontSize="13" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Notify When Run</text>
      {/* Toggle OFF */}
      <rect x="220" y="422" width="34" height="18" rx="9" fill="#636366" />
      <circle cx="230" cy="431" r="7" fill="white" />
    </PhoneSVG>
  );
}

// ── SLIDE 4 — Action: Get Contents of URL ────────────────────────────────────

function Mockup4() {
  return (
    <PhoneSVG id="s4">
      {/* Nav */}
      <rect x="14" y="46" width="252" height="44" fill="#000" />
      <text x="30" y="72" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">‹ Transaction</text>
      <text x="140" y="72" textAnchor="middle" fontSize="15" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">New Automation</text>
      <text x="255" y="72" textAnchor="end" fontSize="14" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Done</text>
      <rect x="14" y="90" width="252" height="0.5" fill="#38383a" />

      {/* Action block */}
      <rect x="18" y="100" width="244" height="244" rx="16" fill="#1c1c1e" />

      {/* Action title bar */}
      <rect x="18" y="100" width="244" height="38" rx="16" fill="#2c2c2e" />
      <rect x="18" y="118" width="244" height="20" fill="#2c2c2e" />
      <text x="36" y="123" fontSize="13" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>

      {/* URL field */}
      <rect x="18" y="138" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="156" fontSize="11" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">URL</text>
      <rect x="60" y="143" width="192" height="24" rx="6" fill="#2c2c2e" />
      <text x="68" y="159" fontSize="11" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">https://your-webhook-url</text>

      {/* Method row */}
      <rect x="18" y="168" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="186" fontSize="12" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Method</text>
      {/* POST pill */}
      <rect x="185" y="176" width="36" height="20" rx="10" fill="#0a84ff" />
      <text x="203" y="190" textAnchor="middle" fontSize="11" fontWeight="700" fill="white" fontFamily="-apple-system,system-ui,sans-serif">POST</text>

      {/* Request Body row */}
      <rect x="18" y="198" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="216" fontSize="12" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Request Body</text>
      {/* JSON pill */}
      <rect x="183" y="206" width="38" height="20" rx="10" fill="#30d158" fillOpacity="0.25" stroke="#30d158" strokeWidth="1" />
      <text x="202" y="220" textAnchor="middle" fontSize="11" fontWeight="700" fill="#30d158" fontFamily="-apple-system,system-ui,sans-serif">JSON</text>

      {/* Key-value divider */}
      <rect x="18" y="228" width="244" height="0.5" fill="#38383a" />

      {/* KEY label */}
      <text x="30" y="246" fontSize="10" fontWeight="600" fill="#636366" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">KEY</text>
      <text x="148" y="246" fontSize="10" fontWeight="600" fill="#636366" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">VALUE</text>

      {/* Key field */}
      <rect x="22" y="252" width="110" height="24" rx="8" fill="#2c2c2e" />
      <text x="77" y="268" textAnchor="middle" fontSize="12" fontWeight="500" fill="white" fontFamily="-apple-system,system-ui,sans-serif">transaction</text>

      {/* Value: Shortcut Input chip */}
      <rect x="140" y="252" width="110" height="24" rx="12" fill="#0a84ff" />
      <text x="195" y="268" textAnchor="middle" fontSize="11" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Shortcut Input</text>

      {/* Add field button */}
      <rect x="18" y="278" width="244" height="0.5" fill="#38383a" />
      <rect x="18" y="278" width="244" height="66" rx="0" fill="transparent" />
      <rect x="18" y="342" width="244" height="2" rx="16" fill="#1c1c1e" />
      <text x="140" y="316" textAnchor="middle" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add new field</text>

      {/* Bottom area label */}
      <text x="140" y="382" textAnchor="middle" fontSize="10" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">Tap Done when finished</text>
    </PhoneSVG>
  );
}

// ── SLIDE 5 — URL entered + highlighted ──────────────────────────────────────

function Mockup5({ url }: { url: string }) {
  const display = url.length > 34 ? url.slice(0, 31) + "…" : url;
  const displayLine2 = url.length > 34 ? url.slice(31) : "";

  return (
    <PhoneSVG id="s5">
      {/* Nav */}
      <rect x="14" y="46" width="252" height="44" fill="#000" />
      <text x="30" y="72" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">‹ Transaction</text>
      <text x="140" y="72" textAnchor="middle" fontSize="15" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">New Automation</text>
      <text x="255" y="72" textAnchor="end" fontSize="14" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Done</text>
      <rect x="14" y="90" width="252" height="0.5" fill="#38383a" />

      {/* Action block */}
      <rect x="18" y="100" width="244" height="264" rx="16" fill="#1c1c1e" />

      {/* Action title */}
      <rect x="18" y="100" width="244" height="38" rx="16" fill="#2c2c2e" />
      <rect x="18" y="118" width="244" height="20" fill="#2c2c2e" />
      <text x="36" y="123" fontSize="13" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>

      {/* URL field — highlighted / filled */}
      <rect x="18" y="138" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="156" fontSize="11" fill="#636366" fontFamily="-apple-system,system-ui,sans-serif">URL</text>
      <rect x="60" y="140" width="194" height="40" rx="8" fill="#0a84ff" fillOpacity="0.12" stroke="#0a84ff" strokeWidth="1.2" />
      <text x="68" y="155" fontSize="9.5" fontWeight="500" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">{display}</text>
      {displayLine2 && (
        <text x="68" y="170" fontSize="9.5" fontWeight="500" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">{displayLine2}</text>
      )}

      {/* Method row */}
      <rect x="18" y="182" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="200" fontSize="12" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Method</text>
      <rect x="185" y="190" width="36" height="20" rx="10" fill="#0a84ff" />
      <text x="203" y="204" textAnchor="middle" fontSize="11" fontWeight="700" fill="white" fontFamily="-apple-system,system-ui,sans-serif">POST</text>

      {/* Request Body */}
      <rect x="18" y="212" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="230" fontSize="12" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Request Body</text>
      <rect x="183" y="220" width="38" height="20" rx="10" fill="#30d158" fillOpacity="0.25" stroke="#30d158" strokeWidth="1" />
      <text x="202" y="234" textAnchor="middle" fontSize="11" fontWeight="700" fill="#30d158" fontFamily="-apple-system,system-ui,sans-serif">JSON</text>

      {/* Key-value */}
      <rect x="18" y="242" width="244" height="0.5" fill="#38383a" />
      <text x="30" y="260" fontSize="10" fontWeight="600" fill="#636366" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">KEY</text>
      <text x="148" y="260" fontSize="10" fontWeight="600" fill="#636366" letterSpacing="0.5" fontFamily="-apple-system,system-ui,sans-serif">VALUE</text>
      <rect x="22" y="266" width="110" height="24" rx="8" fill="#2c2c2e" />
      <text x="77" y="282" textAnchor="middle" fontSize="12" fontWeight="500" fill="white" fontFamily="-apple-system,system-ui,sans-serif">transaction</text>
      <rect x="140" y="266" width="110" height="24" rx="12" fill="#0a84ff" />
      <text x="195" y="282" textAnchor="middle" fontSize="11" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">Shortcut Input</text>

      <rect x="18" y="292" width="244" height="0.5" fill="#38383a" />
      <text x="140" y="330" textAnchor="middle" fontSize="12" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add new field</text>

      {/* Done indicator */}
      <rect x="60" y="382" width="160" height="28" rx="14" fill="#30d158" />
      <text x="140" y="400" textAnchor="middle" fontSize="13" fontWeight="600" fill="white" fontFamily="-apple-system,system-ui,sans-serif">✓ All set!</text>
    </PhoneSVG>
  );
}

// ── Slides data ───────────────────────────────────────────────────────────────

function getSlides(url: string | null) {
  return [
    {
      mockup: <Mockup1 />,
      titleKey: "ap.s1_title",
      descKey: "ap.s1_desc",
    },
    {
      mockup: <Mockup2 />,
      titleKey: "ap.s2_title",
      descKey: "ap.s2_desc",
    },
    {
      mockup: <Mockup3 />,
      titleKey: "ap.s3_title",
      descKey: "ap.s3_desc",
    },
    {
      mockup: <Mockup4 />,
      titleKey: "ap.s4_title",
      descKey: "ap.s4_desc",
    },
    {
      mockup: <Mockup5 url={url ?? "https://budger.app/api/webhook/apple/••••"} />,
      titleKey: "ap.s5_title",
      descKey: "ap.s5_desc",
    },
  ];
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full space-y-2 mt-1">
      <div className="bg-card border border-border rounded-xl px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed select-all">{url}</p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className={`w-full py-3 rounded-2xl font-semibold text-sm transition active:scale-95 ${
          copied
            ? "bg-green-900/30 border border-green-700/40 text-green-400"
            : "bg-foreground text-background"
        }`}
      >
        {copied ? t("ap.copied") : t("ap.copy_link")}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// Props:
//   onDone — called when user finishes last slide (used in onboarding)
//   onClose — called when user closes the modal (used in Notifications)
//   modal — if true, renders as a fixed overlay with a close button

interface ApplePaySlidesProps {
  onDone?: () => void;
  onClose?: () => void;
  modal?: boolean;
}

export default function ApplePaySlides({ onDone, onClose, modal = false }: ApplePaySlidesProps) {
  const [idx, setIdx] = useState(0);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

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

  const slides = getSlides(webhookUrl);
  const isLast = idx === slides.length - 1;
  const slide = slides[idx];

  function goNext() {
    if (isLast) {
      onDone?.();
      onClose?.();
    } else {
      setIdx(i => i + 1);
    }
  }

  function goPrev() {
    if (idx > 0) setIdx(i => i - 1);
  }

  const inner = (
    <div className="flex flex-col w-full max-w-sm mx-auto h-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {t("ap.setup_title")}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {t("ap.step_of", { n: idx + 1, total: slides.length })}
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

      {/* Slide card with tap zones */}
      <div className="relative bg-card border border-border rounded-3xl flex-1 flex flex-col items-center justify-center overflow-hidden min-h-0">
        {/* Left tap zone — go back */}
        <button
          onClick={goPrev}
          disabled={idx === 0}
          className="absolute inset-y-0 left-0 w-1/2 z-10 disabled:cursor-default"
          aria-label={t("ap.prev")}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
        {/* Right tap zone — go forward */}
        <button
          onClick={goNext}
          className="absolute inset-y-0 right-0 w-1/2 z-10"
          aria-label={t("ap.next")}
          style={{ WebkitTapHighlightColor: "transparent" }}
        />

        {/* Content — pointer-events-none so taps hit the zones */}
        <div className="pointer-events-none flex flex-col items-center gap-3 px-5 py-5 w-full h-full justify-between">
          {/* Phone mockup */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            {slide.mockup}
          </div>

          {/* Text */}
          <div className="w-full space-y-1.5 flex-shrink-0">
            <h3 className="text-base font-bold text-foreground text-center leading-snug">
              {t(slide.titleKey)}
            </h3>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              {t(slide.descKey)}
            </p>
          </div>

          {/* Last slide: copy button — z-20 so it sits above the z-10 tap zones */}
          {isLast && (
            <div className="pointer-events-auto relative z-20 w-full">
              {webhookUrl ? (
                <CopyLinkButton url={webhookUrl} />
              ) : (
                <div className="flex items-center justify-center gap-2 py-3">
                  <div className="w-3 h-3 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                  <p className="text-xs text-muted-foreground">{t("ap.generating")}</p>
                </div>
              )}
            </div>
          )}

          {/* Slide dots */}
          <div className="flex gap-2 flex-shrink-0">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "w-5 bg-foreground" : "w-2 bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Tap hint on first slide */}
        {idx === 0 && (
          <p className="pointer-events-none absolute bottom-3 text-[10px] text-muted-foreground/40 tracking-wide">
            {t("ap.tap_hint")}
          </p>
        )}
      </div>
    </div>
  );

  if (!modal) return inner;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col px-5 pt-14 pb-10">
      {inner}
    </div>
  );
}
