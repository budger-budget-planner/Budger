// Glow border: 3 layered strokes — outermost brightest, innermost darkest

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
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amt));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amt));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Glow layers: draw widest stroke first (outer/bright), then progressively
// narrower + darker on top. Each inner draw masks the centre of the previous,
// leaving only the outer ring visible per layer.
const RED_LAYERS   = ["#ff9999", "#ff4444", "#bb1111"]; // outer→inner (bright→dark)
const ORANGE_LAYERS = ["#e8a454", "#c97d2c", "#8f5010"]; // outer→inner

function GlowStroke({ d, layers }: { d: string; layers: string[] }) {
  // layers[0] = outer (brightest, widest), layers[2] = inner (darkest, 1px)
  return (
    <>
      <path d={d} fill="none" stroke={layers[0]} strokeWidth={3} />
      <path d={d} fill="none" stroke={layers[1]} strokeWidth={2} />
      <path d={d} fill="none" stroke={layers[2]} strokeWidth={1} />
    </>
  );
}

const segs = [
  {
    start: 0,   end: 117.5, fill: "#6366f1",
    darken: hexDarken("#6366f1", 0.52),
    label: "Normal", layers: null,
    spent: 400, budget: 600,
  },
  {
    start: 120, end: 237.5, fill: "#14b8a6",
    darken: null,
    label: "Over-budget", layers: RED_LAYERS,
    spent: 800, budget: 500,
  },
  {
    start: 240, end: 357.5, fill: "#3b82f6",
    darken: hexDarken("#3b82f6", 0.52),
    label: "Stretched", layers: ORANGE_LAYERS,
    spent: 300, budget: 450,
  },
];

function Segment({ seg }: { seg: typeof segs[0] }) {
  const isOver = seg.label === "Over-budget";
  const d = arc(RI, RO, seg.start, seg.end);

  if (isOver) {
    return (
      <>
        <path d={d} fill={seg.fill} stroke="none" />
        {seg.layers && <GlowStroke d={d} layers={seg.layers} />}
      </>
    );
  }

  const spentFrac = seg.spent / seg.budget;
  const spentEnd = seg.start + (seg.end - seg.start) * spentFrac;
  const dFull = arc(RI, RO, seg.start, seg.end);

  return (
    <>
      <path d={arc(RI, RO, seg.start, spentEnd)} fill={seg.fill} stroke="none" />
      <path d={arc(RI, RO, spentEnd, seg.end)} fill={seg.darken!} stroke="none" />
      {seg.layers
        ? <GlowStroke d={dFull} layers={seg.layers} />
        : <path d={dFull} fill="none" stroke={seg.fill + "90"} strokeWidth={1} />
      }
    </>
  );
}

function LegendSwatch({ layers }: { layers: string[] | null }) {
  if (!layers) {
    return (
      <svg width={20} height={20}>
        <rect x={2} y={2} width={16} height={16} rx={3}
              fill="#6366f1" stroke="#6366f190" strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg width={20} height={20}>
      <rect x={2}   y={2}   width={16} height={16} rx={3} fill="none" stroke={layers[0]} strokeWidth={4.5} />
      <rect x={2}   y={2}   width={16} height={16} rx={3} fill="none" stroke={layers[1]} strokeWidth={3}   />
      <rect x={2}   y={2}   width={16} height={16} rx={3} fill="none" stroke={layers[2]} strokeWidth={1.5} />
    </svg>
  );
}

export function GlowBorder() {
  return (
    <div style={{
      minHeight: "100vh", background: "#111", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif", padding: 24,
    }}>
      <p style={{
        fontSize: 11, color: "#6b7280", letterSpacing: "0.08em",
        textTransform: "uppercase", marginBottom: 12, marginTop: 0,
      }}>
        Glow border — 3 layers
      </p>

      <svg width={240} height={240} viewBox="0 0 320 320"
           style={{ overflow: "visible", display: "block" }}>
        {segs.map((seg, i) => <Segment key={i} seg={seg} />)}
        <text x={CX} y={CY - 8}  textAnchor="middle" fill="#f9fafb" fontSize={22} fontWeight="700">67%</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fill="#9ca3af" fontSize={12}>of budget</text>
      </svg>

      <div style={{ marginTop: 20, width: 220 }}>
        {segs.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <LegendSwatch layers={seg.layers} />
            <span style={{ fontSize: 13, color: "#e5e7eb" }}>{seg.label}</span>
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
              {seg.layers ? "3-layer glow" : "border 1px"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
