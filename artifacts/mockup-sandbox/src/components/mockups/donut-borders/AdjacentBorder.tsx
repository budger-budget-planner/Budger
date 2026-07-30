// Mockup: adjacent segment border comparison
// Shows two neighboring expanded donut segments.
// LEFT  — current:  all edges 3px (touching inner edges feel merged)
// RIGHT — proposed: arc edges 3px, touching end-caps 1px (creates air)

const CX = 160, CY = 160, RI = 75, RO = 128, EXPAND = 14;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Full closed arc path (used for fills and "current" borders)
function arcPath(cx: number, cy: number, ri: number, ro: number, start: number, end: number) {
  const sweep = Math.min(end - start, 359.99);
  const e = start + sweep;
  const s0 = polar(cx, cy, ro, start); const e0 = polar(cx, cy, ro, e);
  const s1 = polar(cx, cy, ri, start); const e1 = polar(cx, cy, ri, e);
  const lg = sweep > 180 ? 1 : 0;
  return `M${s0.x} ${s0.y} A${ro} ${ro} 0 ${lg} 1 ${e0.x} ${e0.y} L${e1.x} ${e1.y} A${ri} ${ri} 0 ${lg} 0 ${s1.x} ${s1.y}Z`;
}

// Just the two arc curves (outer + inner), no radial caps — for the 3px arc-only stroke
function arcCurvesOnly(cx: number, cy: number, ri: number, ro: number, start: number, end: number) {
  const sweep = Math.min(end - start, 359.99);
  const e = start + sweep;
  const s0 = polar(cx, cy, ro, start); const e0 = polar(cx, cy, ro, e);
  const s1 = polar(cx, cy, ri, start); const e1 = polar(cx, cy, ri, e);
  const lg = sweep > 180 ? 1 : 0;
  // Outer arc (open path)
  const outer = `M${s0.x} ${s0.y} A${ro} ${ro} 0 ${lg} 1 ${e0.x} ${e0.y}`;
  // Inner arc (open path, reversed direction so it follows the same visual flow)
  const inner = `M${s1.x} ${s1.y} A${ri} ${ri} 0 ${lg} 1 ${e1.x} ${e1.y}`;
  return { outer, inner };
}

// Just the two radial end-caps — for the 1px thin inner-edge stroke
function arcCapsOnly(cx: number, cy: number, ri: number, ro: number, start: number, end: number) {
  const e = start + Math.min(end - start, 359.99);
  const s_ro = polar(cx, cy, ro, start); const s_ri = polar(cx, cy, ri, start);
  const e_ro = polar(cx, cy, ro, e);    const e_ri = polar(cx, cy, ri, e);
  // start cap (line from outer to inner at start angle)
  const capStart = `M${s_ro.x} ${s_ro.y} L${s_ri.x} ${s_ri.y}`;
  // end cap (line from outer to inner at end angle)
  const capEnd   = `M${e_ro.x} ${e_ro.y} L${e_ri.x} ${e_ri.y}`;
  return { capStart, capEnd };
}

// Two adjacent segments:
// Seg A (orange / stretched): 295°–330°, midDeg 312.5°
// Seg B (red / over-budget):  330°–365°, midDeg 347.5°
const SEG_A = { start: 295, end: 330, mid: 312.5, fill: "#c084fc", color: "#c47a2a" }; // orange
const SEG_B = { start: 330, end: 365, mid: 347.5, fill: "#a78bfa", color: "#ff3333" }; // red

function expand(midDeg: number) {
  const rad = ((midDeg - 90) * Math.PI) / 180;
  return { tx: EXPAND * Math.cos(rad), ty: EXPAND * Math.sin(rad) };
}

type Variant = "current" | "proposed";

function DonutSegments({ variant }: { variant: Variant }) {
  const segs = [SEG_A, SEG_B];

  return (
    <svg
      width="100%"
      viewBox="60 20 220 220"
      style={{ overflow: "visible", display: "block" }}
    >
      {segs.map((seg) => {
        const { tx, ty } = expand(seg.mid);
        const fillD = arcPath(CX, CY, RI, RO, seg.start, seg.end);
        const { outer, inner } = arcCurvesOnly(CX, CY, RI, RO, seg.start, seg.end);
        const { capStart, capEnd } = arcCapsOnly(CX, CY, RI, RO, seg.start, seg.end);

        // Which cap is the "touching" one?
        // Seg A: touching cap is at end (330°), outer cap at start (295°)
        // Seg B: touching cap is at start (330°), outer cap at end (365°)
        const isA = seg === SEG_A;
        const touchingCap  = isA ? capEnd   : capStart;
        const outerCap     = isA ? capStart : capEnd;

        return (
          <g key={seg.start} transform={`translate(${tx}, ${ty})`}>
            {/* Fill */}
            <path d={fillD} fill={seg.fill} stroke="none" />

            {variant === "current" ? (
              /* Current: single closed border path, 3px all around */
              <path d={fillD} fill="none" stroke={seg.color} strokeWidth={3} />
            ) : (
              /* Proposed: arc curves 3px, touching end-cap 1px, outer end-cap 3px */
              <>
                <path d={outer}       fill="none" stroke={seg.color} strokeWidth={3} strokeLinecap="round" />
                <path d={inner}       fill="none" stroke={seg.color} strokeWidth={3} strokeLinecap="round" />
                <path d={outerCap}    fill="none" stroke={seg.color} strokeWidth={3} strokeLinecap="round" />
                <path d={touchingCap} fill="none" stroke={seg.color} strokeWidth={1} strokeLinecap="round" />
              </>
            )}
          </g>
        );
      })}

      {/* Inner hole */}
      <circle cx={CX} cy={CY} r={RI} fill="#111" />
      {/* Surrounding ring hint */}
      <circle cx={CX} cy={CY} r={RO + 2} fill="none" stroke="#333" strokeWidth={0.5} />
      <circle cx={CX} cy={CY} r={RI - 2} fill="none" stroke="#333" strokeWidth={0.5} />
    </svg>
  );
}

export function AdjacentBorder() {
  return (
    <div
      style={{
        background: "#111",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        fontFamily: "system-ui, sans-serif",
        gap: "24px",
      }}
    >
      <div style={{ display: "flex", gap: "48px", alignItems: "flex-start" }}>
        {/* LEFT — current */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ color: "#aaa", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>
            Current — 3px all edges
          </div>
          <div style={{ width: 260, height: 260, position: "relative" }}>
            <DonutSegments variant="current" />
          </div>
          {/* Callout arrow pointing at touching edges */}
          <div style={{ color: "#666", fontSize: "11px", textAlign: "center", maxWidth: 220, lineHeight: 1.4 }}>
            Two 3px borders side-by-side at the join — feels heavy
          </div>
          <div
            style={{
              border: "1.5px solid #ff3333",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              color: "#ff6666",
            }}
          >
            3px + 3px at the join = 6px visual weight
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 320, background: "#333", alignSelf: "center" }} />

        {/* RIGHT — proposed */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ color: "#aaa", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>
            Proposed — 3px arc, 1px touching cap
          </div>
          <div style={{ width: 260, height: 260, position: "relative" }}>
            <DonutSegments variant="proposed" />
          </div>
          <div style={{ color: "#666", fontSize: "11px", textAlign: "center", maxWidth: 220, lineHeight: 1.4 }}>
            Outer arc stays 3px — only the shared cap edge is 1px
          </div>
          <div
            style={{
              border: "1.5px solid #22c55e",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              color: "#4ade80",
            }}
          >
            1px + 1px at the join = more air between segments
          </div>
        </div>
      </div>

      {/* Zoom annotation */}
      <div style={{ color: "#555", fontSize: "10px", textAlign: "center" }}>
        Viewing area cropped to the two adjacent expanded segments
      </div>
    </div>
  );
}
