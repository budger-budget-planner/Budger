// Doubled border thickness: red=3.0, orange=3.0

const CX = 160, CY = 160, RI = 75, RO = 128;

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arc(ri: number, ro: number, start: number, end: number) {
  const sweep = Math.min(end - start, 359.99);
  const e = start + sweep;
  const s0 = polar(ro, start), e0 = polar(ro, e);
  const s1 = polar(ri, start), e1 = polar(ri, e);
  const lg = sweep > 180 ? 1 : 0;
  return `M${s0.x} ${s0.y} A${ro} ${ro} 0 ${lg} 1 ${e0.x} ${e0.y} L${e1.x} ${e1.y} A${ri} ${ri} 0 ${lg} 0 ${s1.x} ${s1.y}Z`;
}

function hexDarken(hex: string, amt: number) {
  const h = hex.replace("#","");
  const r = Math.round(parseInt(h.slice(0,2),16)*(1-amt));
  const g = Math.round(parseInt(h.slice(2,4),16)*(1-amt));
  const b = Math.round(parseInt(h.slice(4,6),16)*(1-amt));
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

// Same three segments — doubled strokeWidth for red and orange
const segs = [
  { start: 0,   end: 117.5, fill: "#6366f1", darken: hexDarken("#6366f1", 0.52), label: "Normal",      borderColor: "#6366f190", strokeWidth: 1,   spent: 400, budget: 600 },
  { start: 120, end: 237.5, fill: "#ef4444", darken: null,                        label: "Over-budget", borderColor: "#ff3333",   strokeWidth: 3.0, spent: 800, budget: 500 },
  { start: 240, end: 357.5, fill: "#f59e0b", darken: hexDarken("#f59e0b", 0.52),  label: "Stretched",   borderColor: "#c47a2a",   strokeWidth: 3.0, spent: 300, budget: 450 },
];

function Segment({ seg }: { seg: typeof segs[0] }) {
  const isOver = seg.label === "Over-budget";
  if (isOver) {
    return (
      <>
        <path d={arc(RI, RO, seg.start, seg.end)} fill={seg.fill} stroke="none" />
        <path d={arc(RI, RO, seg.start, seg.end)} fill="none"
              stroke={seg.borderColor} strokeWidth={seg.strokeWidth} />
      </>
    );
  }
  const spentFrac = seg.spent / seg.budget;
  const spentEnd = seg.start + (seg.end - seg.start) * spentFrac;
  return (
    <>
      <path d={arc(RI, RO, seg.start, spentEnd)} fill={seg.fill} stroke="none" />
      <path d={arc(RI, RO, spentEnd, seg.end)} fill={seg.darken!} stroke="none" />
      <path d={arc(RI, RO, seg.start, seg.end)} fill="none"
            stroke={seg.borderColor} strokeWidth={seg.strokeWidth} />
    </>
  );
}

function Label({ seg, borderColor, sw }: { seg: typeof segs[0]; borderColor: string; sw: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <svg width={20} height={20}>
        <rect x={2} y={2} width={16} height={16} rx={3}
              fill={seg.fill} stroke={borderColor} strokeWidth={sw * 1.5} />
      </svg>
      <span style={{ fontSize: 13, color: "#e5e7eb" }}>{seg.label}</span>
      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
        border {sw}px
      </span>
    </div>
  );
}

export function Doubled() {
  return (
    <div style={{
      minHeight: "100vh", background: "#111", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif", padding: 24,
    }}>
      <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em",
                  textTransform: "uppercase", marginBottom: 12, marginTop: 0 }}>
        Doubled thickness
      </p>

      <svg width={240} height={240} viewBox="0 0 320 320" style={{ overflow: "visible", display: "block" }}>
        <defs>
          <filter id="redGlow-dbl" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1.5 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 0" result="redBlur" />
            <feMerge>
              <feMergeNode in="redBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {segs.map((seg, i) => (
          <g key={i} style={{ filter: seg.label === "Over-budget" ? "url(#redGlow-dbl)" : "none" }}>
            <Segment seg={seg} />
          </g>
        ))}
        {/* Centre label */}
        <text x={CX} y={CY - 8} textAnchor="middle" fill="#f9fafb" fontSize={22} fontWeight="700">67%</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fill="#9ca3af" fontSize={12}>of budget</text>
      </svg>

      <div style={{ marginTop: 20, width: 220 }}>
        {segs.map((seg, i) => (
          <Label key={i} seg={seg} borderColor={seg.borderColor} sw={seg.strokeWidth} />
        ))}
      </div>
    </div>
  );
}
