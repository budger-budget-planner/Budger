import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// iPhone frame
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
// SLIDE 1 — Result: select price text online → share → Budger logs it
// ─────────────────────────────────────────────────────────────────────────────
function Mockup1() {
  return (
    <Phone id="ss1">
      {/* Safari address bar */}
      <rect x="11" y="44" width="242" height="50" fill="#111" />
      <rect x="22" y="54" width="220" height="28" rx="9" fill="#1c1c1e" />
      <text x="132" y="73" textAnchor="middle" fontSize="10.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">shop.example.com</text>
      <rect x="11" y="94" width="242" height="0.5" fill="#2a2a2e" />

      {/* Page content */}
      <rect x="11" y="95" width="242" height="190" fill="#111" />
      <text x="24" y="118" fontSize="10.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Order Confirmation</text>
      <text x="24" y="140" fontSize="14" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Morning Latte · Oat</text>
      {/* Price selected */}
      <rect x="22" y="152" width="62" height="22" rx="5" fill="#0a84ff" fillOpacity="0.35" />
      <text x="53" y="167" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">€4.80</text>
      <circle cx="22" cy="163" r="4" fill="#0a84ff" />
      <circle cx="84" cy="163" r="4" fill="#0a84ff" />
      {/* Context menu — Copy first, then Share */}
      <rect x="14" y="174" width="80" height="50" rx="10" fill="#2c2c2e" stroke="#3a3a3e" strokeWidth="0.8" />
      {/* Copy — step 1, highlighted */}
      <rect x="14" y="174" width="80" height="24" rx="10" fill="#0a84ff" fillOpacity="0.20" />
      <rect x="14" y="186" width="80" height="12" fill="#0a84ff" fillOpacity="0.20" />
      <text x="54" y="190" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">① Copy</text>
      <rect x="16" y="198" width="76" height="0.5" fill="#3a3a3e" />
      {/* Share — step 2 */}
      <text x="54" y="213" textAnchor="middle" fontSize="10" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">② Share…</text>

      {/* Share sheet */}
      <rect x="11" y="285" width="242" height="174" fill="#1c1c1e" />
      <rect x="96" y="291" width="72" height="4" rx="2" fill="#3a3a3e" />
      <text x="132" y="311" textAnchor="middle" fontSize="10" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Share via Shortcuts</text>
      {/* Feed the Budger row — highlighted */}
      <rect x="14" y="318" width="236" height="44" rx="10" fill="#0a84ff" fillOpacity="0.13" stroke="#0a84ff" strokeWidth="0.7" />
      <rect x="24" y="329" width="24" height="22" rx="7" fill="#30d158" />
      <text x="36" y="344" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">⚡</text>
      <text x="56" y="344" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Feed the Budger</text>
      <rect x="11" y="364" width="242" height="0.5" fill="#2e2e32" />
      <text x="24" y="382" fontSize="12" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Copy</text>
      <rect x="11" y="392" width="242" height="0.5" fill="#2e2e32" />
      <text x="24" y="410" fontSize="12" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Look Up</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Shortcuts → new shortcut → add "Text" action → tap ⓘ → Show in Share Sheet
// ─────────────────────────────────────────────────────────────────────────────
function Mockup2() {
  return (
    <Phone id="ss2">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Text action card — added */}
      <rect x="14" y="96" width="236" height="56" rx="14" fill="#1c1c1e" />
      {/* Yellow Text icon */}
      <rect x="22" y="110" width="26" height="26" rx="7" fill="#ffd60a" />
      <text x="35" y="127" textAnchor="middle" fontSize="12" fontWeight="700" fill="#000" fontFamily="-apple-system,system-ui,sans-serif">T</text>
      <text x="55" y="122" fontSize="13" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Text</text>
      <text x="55" y="136" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Tap to edit…</text>
      {/* ⓘ icon — highlighted with pulsing ring */}
      <circle cx="228" cy="124" r="11" fill="#0a84ff" fillOpacity="0.2" stroke="#0a84ff" strokeWidth="1.2" strokeDasharray="2.5 1.5" />
      <circle cx="228" cy="124" r="7" fill="#0a84ff" fillOpacity="0.85" />
      <text x="228" y="128" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">i</text>

      {/* Callout dropdown from ⓘ */}
      <rect x="100" y="156" width="152" height="108" rx="12" fill="#2c2c2e" stroke="#3a3a3e" strokeWidth="0.8" />
      {/* Arrow pointing up to ⓘ */}
      <polygon points="220,150 228,156 236,150" fill="#2c2c2e" stroke="#3a3a3e" strokeWidth="0.4" />
      <text x="176" y="177" textAnchor="middle" fontSize="10.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Action Settings</text>
      <rect x="108" y="182" width="136" height="0.5" fill="#3a3a3e" />
      <text x="176" y="199" textAnchor="middle" fontSize="11" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Add to Home Screen</text>
      <rect x="108" y="204" width="136" height="0.5" fill="#3a3a3e" />
      {/* Highlighted row */}
      <rect x="102" y="205" width="148" height="28" rx="0" fill="#0a84ff" fillOpacity="0.14" />
      <text x="176" y="223" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Show in Share Sheet</text>
      <rect x="108" y="234" width="136" height="0.5" fill="#3a3a3e" />
      <text x="176" y="251" textAnchor="middle" fontSize="11" fill="#ebebf0" fontFamily="-apple-system,system-ui,sans-serif">Delete Action</text>

      {/* Add action button — faded */}
      <rect x="68" y="280" width="128" height="30" rx="15" fill="#1c1c1e" stroke="#2a2a2e" strokeWidth="0.8" opacity="0.5" />
      <text x="132" y="300" textAnchor="middle" fontSize="11.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">+ Add Action</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — "Receive [Text] from [Share Sheet]" appeared → tap first field → choose Text only
// ─────────────────────────────────────────────────────────────────────────────
function Mockup3() {
  return (
    <Phone id="ss3">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Receive … from … action */}
      <rect x="14" y="96" width="236" height="72" rx="14" fill="#1c1c1e" />
      <rect x="14" y="96" width="236" height="36" rx="14" fill="#272729" />
      <rect x="14" y="114" width="236" height="18" fill="#272729" />
      <rect x="20" y="107" width="22" height="17" rx="5" fill="#0a84ff" opacity="0.85" />
      <text x="31" y="119" textAnchor="middle" fontSize="9" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">↙</text>
      <text x="48" y="119" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Receive</text>
      {/* First field — highlighted/tapped */}
      <rect x="93" y="110" width="50" height="18" rx="9" fill="#0a84ff" stroke="#0a84ff" strokeWidth="0.6" />
      <text x="118" y="122" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Text</text>
      <text x="148" y="119" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">from</text>
      <rect x="172" y="110" width="64" height="18" rx="9" fill="#3a3a3e" />
      <text x="204" y="122" textAnchor="middle" fontSize="9.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Share Sheet</text>
      {/* If no input row */}
      <rect x="14" y="132" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="155" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">If there's no input:</text>
      <text x="154" y="155" fontSize="10" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">Continue</text>

      {/* Type picker popup */}
      <rect x="14" y="172" width="236" height="200" rx="16" fill="#1e1e22" stroke="#2e2e32" strokeWidth="0.8" />
      <text x="132" y="193" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Choose Type</text>
      <rect x="14" y="200" width="236" height="0.5" fill="#2e2e32" />

      {/* Text — checked/selected */}
      <rect x="14" y="201" width="236" height="38" fill="#0a84ff" fillOpacity="0.10" />
      <text x="32" y="224" fontSize="12" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Text</text>
      <text x="240" y="224" textAnchor="end" fontSize="14" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">✓</text>
      <rect x="14" y="239" width="236" height="0.5" fill="#2e2e32" />

      {/* Other types — grey/deselected */}
      <text x="32" y="262" fontSize="12" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Images</text>
      <rect x="14" y="277" width="236" height="0.5" fill="#2e2e32" />
      <text x="32" y="300" fontSize="12" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Files</text>
      <rect x="14" y="315" width="236" height="0.5" fill="#2e2e32" />
      <text x="32" y="338" fontSize="12" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">URLs</text>
      <rect x="14" y="353" width="236" height="0.5" fill="#2e2e32" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Add "Get Clipboard" action (replaces Text + Shortcut Input)
// ─────────────────────────────────────────────────────────────────────────────
function Mockup4() {
  return (
    <Phone id="ss4">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Receive action — compact/faded */}
      <rect x="14" y="96" width="236" height="32" rx="10" fill="#1c1c1e" opacity="0.5" />
      <text x="28" y="116" fontSize="10.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Receive Text from Share Sheet</text>

      {/* Get Clipboard action — active/highlighted */}
      <rect x="14" y="136" width="236" height="52" rx="14" fill="#1c1c1e" stroke="#0a84ff" strokeWidth="0.8" strokeOpacity="0.6" />
      {/* Green clipboard icon */}
      <rect x="22" y="150" width="22" height="22" rx="6" fill="#30d158" />
      <rect x="27" y="154" width="12" height="14" rx="2" fill="#fff" fillOpacity="0.9" />
      <rect x="29" y="152" width="8" height="5" rx="2" fill="#30d158" />
      <rect x="30" y="151" width="4" height="4" rx="1" fill="#fff" fillOpacity="0.9" />
      <text x="52" y="159" fontSize="13" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Clipboard</text>
      <text x="52" y="175" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">reads whatever you just Copied</text>

      {/* Hint */}
      <text x="132" y="218" textAnchor="middle" fontSize="9.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">Tap + Add Action, search "clipboard"</text>
      <text x="132" y="232" textAnchor="middle" fontSize="9.5" fill="#8e8e93" fontFamily="-apple-system,system-ui,sans-serif">and select Get Clipboard</text>

      {/* Search UI hint */}
      <rect x="14" y="248" width="236" height="32" rx="10" fill="#1c1c1e" stroke="#2e2e32" strokeWidth="0.6" />
      <rect x="22" y="258" width="16" height="12" rx="3" fill="#30d158" />
      <rect x="25" y="261" width="10" height="6" rx="1" fill="#fff" fillOpacity="0.9" />
      <rect x="26" y="260" width="8" height="3" rx="1" fill="#30d158" />
      <text x="46" y="268" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Clipboard</text>
      <rect x="220" y="255" width="22" height="20" rx="6" fill="#0a84ff" fillOpacity="0.85" />
      <text x="231" y="269" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">+</text>

      {/* + Add Action button */}
      <rect x="68" y="300" width="128" height="30" rx="15" fill="#1c1c1e" stroke="#2a2a2e" strokeWidth="0.8" opacity="0.5" />
      <text x="132" y="320" textAnchor="middle" fontSize="11.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">+ Add Action</text>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — Add "Get Contents of URL" · POST · JSON · transaction → Text action
// ─────────────────────────────────────────────────────────────────────────────
function Mockup5() {
  return (
    <Phone id="ss5">
      <NavBar title="New Shortcut" back="Shortcuts" rightLabel="Done" />

      {/* Receive — faded */}
      <rect x="14" y="96" width="236" height="26" rx="8" fill="#1c1c1e" opacity="0.4" />
      <text x="28" y="113" fontSize="9.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Receive Text from Share Sheet</text>

      {/* Get Clipboard — faded */}
      <rect x="14" y="128" width="236" height="26" rx="8" fill="#1c1c1e" opacity="0.4" />
      <rect x="22" y="136" width="16" height="14" rx="4" fill="#30d158" opacity="0.5" />
      <text x="44" y="146" fontSize="9.5" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Get Clipboard</text>

      {/* Get Contents of URL — main */}
      <rect x="14" y="162" width="236" height="174" rx="14" fill="#1c1c1e" />
      <rect x="14" y="162" width="236" height="32" rx="14" fill="#272729" />
      <rect x="14" y="178" width="236" height="16" fill="#272729" />
      <rect x="20" y="173" width="18" height="13" rx="4" fill="#0a84ff" opacity="0.85" />
      <text x="44" y="182" fontSize="11" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL</text>

      {/* URL */}
      <rect x="14" y="194" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="210" fontSize="9" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">URL</text>
      <rect x="44" y="199" width="198" height="18" rx="6" fill="#0a84ff" fillOpacity="0.10" stroke="#0a84ff" strokeWidth="0.5" />
      <text x="52" y="211" fontSize="8" fill="#4da3ff" fontFamily="-apple-system,system-ui,sans-serif">https://…/api/webhook/apple/…</text>

      {/* Method POST */}
      <rect x="14" y="219" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="235" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Method</text>
      <rect x="195" y="225" width="36" height="18" rx="9" fill="#0a84ff" fillOpacity="0.2" stroke="#0a84ff" strokeWidth="0.6" />
      <text x="213" y="237" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">POST</text>

      {/* Body JSON */}
      <rect x="14" y="245" width="236" height="0.5" fill="#2e2e32" />
      <text x="22" y="261" fontSize="11" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Request Body</text>
      <rect x="191" y="251" width="38" height="18" rx="9" fill="#30d158" fillOpacity="0.15" stroke="#30d158" strokeWidth="0.5" />
      <text x="210" y="263" textAnchor="middle" fontSize="9" fontWeight="700" fill="#30d158" fontFamily="-apple-system,system-ui,sans-serif">JSON</text>

      {/* transaction → Text chip */}
      <rect x="14" y="271" width="236" height="0.5" fill="#2e2e32" />
      <rect x="18" y="277" width="76" height="20" rx="7" fill="#2a2a2e" />
      <text x="56" y="291" textAnchor="middle" fontSize="10" fontWeight="500" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">transaction</text>
      {/* Value: Clipboard chip (green = Get Clipboard output) */}
      <rect x="100" y="277" width="74" height="20" rx="10" fill="#30d158" />
      <text x="137" y="291" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#000" fontFamily="-apple-system,system-ui,sans-serif">Clipboard</text>

      {/* Add field */}
      <rect x="14" y="299" width="236" height="0.5" fill="#2e2e32" />
      <text x="132" y="320" textAnchor="middle" fontSize="10" fill="#0a84ff" fontFamily="-apple-system,system-ui,sans-serif">+ Add new field</text>
      <rect x="14" y="334" width="236" height="0.5" fill="#2e2e32" />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — Add Show Notification · "🦡 Captured and Saved to Budger 🦡" · copy URL
// ─────────────────────────────────────────────────────────────────────────────
function Mockup6() {
  return (
    <Phone id="ss6">
      <NavBar title="Feed the Budger" back="Shortcuts" rightLabel="Done" />

      {/* Receive — faded */}
      <rect x="14" y="96" width="236" height="24" rx="7" fill="#1c1c1e" opacity="0.35" />
      <text x="28" y="112" fontSize="9" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Receive Text from Share Sheet</text>

      {/* Get Clipboard — faded */}
      <rect x="14" y="126" width="236" height="24" rx="7" fill="#1c1c1e" opacity="0.35" />
      <rect x="20" y="133" width="13" height="11" rx="3" fill="#30d158" opacity="0.5" />
      <text x="38" y="142" fontSize="9" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Get Clipboard</text>

      {/* Get Contents — faded */}
      <rect x="14" y="156" width="236" height="24" rx="7" fill="#1c1c1e" opacity="0.35" />
      <rect x="20" y="163" width="13" height="11" rx="3" fill="#0a84ff" opacity="0.5" />
      <text x="38" y="172" fontSize="9" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Get Contents of URL · POST · JSON</text>

      {/* Show Notification — highlighted */}
      <rect x="14" y="188" width="236" height="100" rx="14" fill="#1c1c1e" stroke="#0a84ff" strokeWidth="0.8" strokeOpacity="0.5" />
      <rect x="14" y="188" width="236" height="32" rx="14" fill="#272729" />
      <rect x="14" y="204" width="236" height="16" fill="#272729" />
      {/* Bell icon */}
      <rect x="20" y="198" width="18" height="14" rx="4" fill="#ff453a" opacity="0.9" />
      <text x="29" y="209" textAnchor="middle" fontSize="8" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">🔔</text>
      <text x="44" y="209" fontSize="11" fontWeight="600" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">Show Notification</text>

      {/* Notification body field */}
      <rect x="14" y="222" width="236" height="0.5" fill="#2e2e32" />
      <rect x="18" y="228" width="228" height="52" rx="9" fill="#2a2a2e" />
      <text x="30" y="248" fontSize="10.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">🦡 Przechwycone i Zapisane</text>
      <text x="30" y="264" fontSize="10.5" fill="#fff" fontFamily="-apple-system,system-ui,sans-serif">w Budgerze 🦡</text>

      {/* Done / Done label */}
      <rect x="14" y="300" width="236" height="0.5" fill="#2a2a2e" />
      <text x="132" y="325" textAnchor="middle" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">Tap Done — then copy the URL below</text>
      <text x="132" y="342" textAnchor="middle" fontSize="10" fill="#636368" fontFamily="-apple-system,system-ui,sans-serif">and paste it into the URL field</text>
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
      {copied ? t("ap.copied") : t("ap.copy_link")}
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
  { mockup: <Mockup6 />, titleKey: "ss.s6_title", descKey: "ss.s6_desc" },
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
  const showCopy = idx === 4;
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

      {/* Header */}
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

      {/* Slide card */}
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

        <div className="pointer-events-none flex flex-col items-center w-full h-full px-4 pt-5 pb-4">
          <div className="flex items-center justify-center w-full overflow-hidden flex-shrink-0" style={{ height: 200 }}>
            {slide.mockup}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center w-full gap-1 py-3">
            <h3 className="text-[13.5px] font-bold text-foreground text-center leading-snug">
              {t(slide.titleKey)}
            </h3>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {t(slide.descKey)}
            </p>
          </div>
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
          <div className="h-5 flex items-center justify-center flex-shrink-0 mt-2">
            {idx === 0 && (
              <p className="text-[9px] text-muted-foreground/35 tracking-widest uppercase">
                {t("ap.tap_hint")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* URL copy — on slide 5 */}
      {showCopy && (
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
