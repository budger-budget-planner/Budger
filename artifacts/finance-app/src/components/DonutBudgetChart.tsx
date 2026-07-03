import { useEffect, useRef, useState } from "react";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";

// ─── Inject hint-pulse keyframes once ────────────────────────────────────────

const HINT_KF_ID = "donut-hint-kf";
if (typeof document !== "undefined" && !document.getElementById(HINT_KF_ID)) {
  const s = document.createElement("style");
  s.id = HINT_KF_ID;
  // Two quick brightens: fade up → fade down → fade up → fade down
  s.textContent = `
    @keyframes donutHintPulse {
      0%          { opacity: 0; }
      12%, 28%    { opacity: 0.32; }
      20%         { opacity: 0.06; }
      40%, 55%    { opacity: 0.32; }
      47%         { opacity: 0.06; }
      68%, 100%   { opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpendingItem = {
  categoryId: number | null;
  categoryName: string | null;
  total: number;
  budget: number | null;
  categoryColor: string | null;
  count: number;
  /** Optional override for the catKey used in the donut chart */
  _catKey?: string;
};

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexDarken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const UNCAT_SPENT_COLOR  = "#9ca3af";
const UNCAT_REMAIN_COLOR = "#374151";

// ─── SVG coordinate system (single, always 320×320) ──────────────────────────
// The container width drives visual size — in compact mode the container is
// 180 px wide, so every SVG unit is scaled ×(180/320 = 0.5625).
// Radii chosen so the ring is pixel-identical to the previous per-mode values:
//   ri = 42 / 0.5625 = 74.67 → 75   (compact display: 75×0.5625 = 42.2 px)
//   ro = 72 / 0.5625 = 128.00 → 128  (compact display: 128×0.5625 = 72.0 px)
//   expand = 8 / 0.5625 = 14.2 → 14  (compact display: 14×0.5625 ≈ 7.9 px)
const CX = 160, CY = 160, RI = 75, RO = 128, EXPAND = 14;

// ─── SVG arc math ─────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, ri: number, ro: number, start: number, end: number): string {
  const sweep = Math.min(end - start, 359.99);
  const e = start + sweep;
  const s0 = polar(cx, cy, ro, start);
  const e0 = polar(cx, cy, ro, e);
  const s1 = polar(cx, cy, ri, start);
  const e1 = polar(cx, cy, ri, e);
  const lg = sweep > 180 ? 1 : 0;
  return `M${s0.x} ${s0.y} A${ro} ${ro} 0 ${lg} 1 ${e0.x} ${e0.y} L${e1.x} ${e1.y} A${ri} ${ri} 0 ${lg} 0 ${s1.x} ${s1.y}Z`;
}

// ─── Segment data ─────────────────────────────────────────────────────────────

type Seg = {
  id: string; catKey: string; d: string; fill: string;
  isOverBudget: boolean; midDeg: number;
};

type GroupBorder = {
  catKey: string; d: string; groupColor: string;
  isOverBudget: boolean; midDeg: number;
};

type LegendItem = {
  catKey: string; color: string; name: string;
  spent: number; budget: number; isOverBudget: boolean;
};

function buildChart(
  spending: SpendingItem[],
  totalBudget: number,
  selectedCat: string | null,
): { segs: Seg[]; groupBorders: GroupBorder[]; legend: LegendItem[] } {
  const CAT_GAP = 2.5;

  const budgeted   = spending.filter(s => s.budget != null && s.budget > 0);
  const unbudgeted = spending.filter(s => s.budget == null || s.budget <= 0);

  const sumBudgets  = budgeted.reduce((a, s) => a + (s.budget ?? 0), 0);
  const uncatBudget = Math.max(0, totalBudget - sumBudgets);
  const uncatSpent  = unbudgeted.reduce((a, s) => a + s.total, 0);
  const uncatRemain = Math.max(0, uncatBudget - uncatSpent);
  const effectiveTotal = Math.max(sumBudgets + uncatBudget, 1);

  type Group = {
    catKey: string; color: string; name: string; spent: number; budget: number;
    parts: Array<{ id: string; fraction: number; fill: string; isOverBudget: boolean }>;
  };

  const groups: Group[] = [];

  for (const s of budgeted) {
    const catKey = s._catKey ?? `cat-${s.categoryId ?? "null"}`;
    const color  = s.categoryColor ?? "#818cf8";
    const spent  = s.total;
    const budget = s.budget!;
    const over   = spent > budget;
    const name   = (!s.categoryName || s.categoryName === "Uncategorized")
      ? t("common.uncategorized") : s.categoryName;

    if (over) {
      groups.push({ catKey, color, name, spent, budget,
        parts: [{ id: `${catKey}-over`, fraction: budget / effectiveTotal, fill: color, isOverBudget: true }] });
    } else {
      const spentFrac  = spent / effectiveTotal;
      const remainFrac = (budget - spent) / effectiveTotal;
      const parts = [];
      if (spentFrac  > 0.001) parts.push({ id: `${catKey}-spent`,  fraction: spentFrac,  fill: color,                    isOverBudget: false });
      if (remainFrac > 0.001) parts.push({ id: `${catKey}-remain`, fraction: remainFrac, fill: hexDarken(color, 0.52),   isOverBudget: false });
      groups.push({ catKey, color, name, spent, budget, parts });
    }
  }

  if (sumBudgets < totalBudget && (uncatBudget > 0 || uncatSpent > 0)) {
    const catKey = "cat-uncat";
    const parts  = [];
    const over   = uncatSpent > uncatBudget;
    if (over || uncatBudget === 0) {
      const frac = uncatBudget > 0 ? uncatBudget / effectiveTotal : uncatSpent / effectiveTotal;
      parts.push({ id: "uncat-over", fraction: frac, fill: UNCAT_SPENT_COLOR,
        isOverBudget: uncatBudget > 0 && over });
    } else {
      const spentFrac  = uncatSpent / effectiveTotal;
      const remainFrac = uncatRemain / effectiveTotal;
      if (spentFrac  > 0.001) parts.push({ id: "uncat-spent",  fraction: spentFrac,  fill: UNCAT_SPENT_COLOR,  isOverBudget: false });
      if (remainFrac > 0.001) parts.push({ id: "uncat-remain", fraction: remainFrac, fill: UNCAT_REMAIN_COLOR, isOverBudget: false });
    }
    if (parts.length > 0) {
      groups.push({ catKey, color: UNCAT_SPENT_COLOR, name: t("common.uncategorized"),
        spent: uncatSpent, budget: uncatBudget, parts });
    }
  }

  const totalGapDeg = CAT_GAP * groups.length;
  const drawDeg     = 360 - totalGapDeg;
  const segs: Seg[]               = [];
  const groupBorders: GroupBorder[] = [];
  let cursor = 0;

  for (const g of groups) {
    const groupDeg     = g.parts.reduce((a, p) => a + p.fraction * drawDeg, 0);
    const isSelected   = selectedCat === g.catKey;
    const outerR       = isSelected ? RO + EXPAND : RO;
    const groupStartDeg = cursor;
    const groupEndDeg   = cursor + groupDeg;
    const groupMidDeg   = (groupStartDeg + groupEndDeg) / 2;

    let partCursor = cursor;
    for (const part of g.parts) {
      const partDeg  = part.fraction * drawDeg;
      const startDeg = partCursor;
      const endDeg   = partCursor + partDeg;
      const midDeg   = (startDeg + endDeg) / 2;
      segs.push({ id: part.id, catKey: g.catKey,
        d: arc(CX, CY, RI, outerR, startDeg, endDeg),
        fill: part.fill, isOverBudget: part.isOverBudget, midDeg });
      partCursor = endDeg;
    }

    groupBorders.push({
      catKey: g.catKey,
      d: arc(CX, CY, RI, outerR, groupStartDeg, groupEndDeg),
      groupColor: g.color,
      isOverBudget: g.spent > g.budget && g.budget > 0,
      midDeg: groupMidDeg,
    });

    cursor += groupDeg + CAT_GAP;
  }

  const legend: LegendItem[] = groups
    .filter(g => g.spent > 0 || g.budget > 0)
    .map(g => ({ catKey: g.catKey, color: g.color, name: g.name, spent: g.spent,
      budget: g.budget, isOverBudget: g.spent > g.budget && g.budget > 0 }));

  return { segs, groupBorders, legend };
}

// ─── Animation constants ──────────────────────────────────────────────────────

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const DUR  = "0.48s";
const TRANS = `${DUR} ${EASE}`;

// Legend exits first: opacity gone in 0.15 s, layout collapses over 0.48 s.
// Legend enters after donut shrinks: max-width + margin both delayed 0.3 s,
// then opacity fades in over 0.28 s (delayed 0.38 s so space opens first).
const LEGEND_EXIT_TRANS  = `max-width ${TRANS}, margin-left ${TRANS}, opacity 0.15s ease`;
const LEGEND_ENTER_TRANS = `max-width ${DUR} 0.3s ${EASE}, margin-left ${DUR} 0.3s ${EASE}, opacity 0.28s ease 0.38s`;

// ─── Component ────────────────────────────────────────────────────────────────

type Props = { spending: SpendingItem[]; totalBudget: number; currency: string };

export default function DonutBudgetChart({ spending, totalBudget, currency }: Props) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [mode,        setMode]        = useState<"compact" | "expanded">("compact");
  // Bump triggers hint re-mount → CSS animation restarts
  const [hintKey, setHintKey] = useState(0);
  const lastCenterTapRef      = useRef<number>(0);

  const { segs, groupBorders, legend } = buildChart(spending, totalBudget, selectedCat);

  const totalSpent    = spending.reduce((a, s) => a + s.total, 0);
  const budgetUsedPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;
  const selectedLegend = legend.find(l => l.catKey === selectedCat) ?? null;
  const expanded       = mode === "expanded";

  // ── Hint pulse: schedule on mount (= each time Dashboard tab enters) ──────
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // 3 pulses: at 3 s, 8 s, 13 s
    for (let i = 0; i < 3; i++) {
      timers.push(setTimeout(() => {
        setHintKey(k => k + 1);
      }, 3_000 + i * 5_000));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleSegmentClick(catKey: string) {
    setSelectedCat(prev => (prev === catKey ? null : catKey));
  }

  function handleCenterTap() {
    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      setMode(m => (m === "compact" ? "expanded" : "compact"));
      setSelectedCat(null);
      lastCenterTapRef.current = 0;
    } else {
      lastCenterTapRef.current = now;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:    "flex",
        alignItems: expanded ? "flex-start" : "center",
        // Gap is only meaningful in compact mode; CSS can't transition to/from
        // "no gap" cleanly so we animate margin-left on the legend instead.
      }}
    >
      {/* ── SVG wrapper ─────────────────────────────────────────────────────
          Width drives visual scale:
          • compact  → 180 px → donut displays at 180/320 = 56 % of viewBox
          • expanded → 100 %  → donut fills the parent card
          The card's height follows the SVG height automatically, giving the
          trend-bar cards below a smooth push as the donut grows/shrinks.   */}
      <div
        style={{
          width:      expanded ? "100%" : 180,
          flexShrink: 0,
          transition: `width ${TRANS}`,
        }}
      >
        <svg
          width="100%"
          viewBox="0 0 320 320"
          style={{ overflow: "visible", display: "block" }}
          aria-label={expanded ? "Spending donut — expanded" : "Spending donut"}
        >
          <defs>
            <filter id="redGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feColorMatrix in="blur" type="matrix"
                values="1.5 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 0"
                result="redBlur" />
              <feMerge>
                <feMergeNode in="redBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Fill paths */}
          {segs.map(seg => {
            const isSel  = selectedCat === seg.catKey;
            const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
            const tx = isSel ? EXPAND * Math.cos(midRad) : 0;
            const ty = isSel ? EXPAND * Math.sin(midRad) : 0;
            return (
              <path
                key={seg.id}
                d={seg.d}
                fill={seg.fill}
                stroke="none"
                style={{
                  transform:  `translate(${tx}px, ${ty}px)`,
                  transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                  filter:     seg.isOverBudget ? "url(#redGlow)" : "none",
                  cursor:     "pointer",
                }}
                onClick={() => handleSegmentClick(seg.catKey)}
              />
            );
          })}

          {/* Group border paths — pointer-events:none so clicks hit fills */}
          {groupBorders.map(gb => {
            const isSel  = selectedCat === gb.catKey;
            const midRad = ((gb.midDeg - 90) * Math.PI) / 180;
            const tx = isSel ? EXPAND * Math.cos(midRad) : 0;
            const ty = isSel ? EXPAND * Math.sin(midRad) : 0;
            return (
              <path
                key={`border-${gb.catKey}`}
                d={gb.d}
                fill="none"
                stroke={gb.isOverBudget ? "#ef4444" : gb.groupColor + "90"}
                strokeWidth={gb.isOverBudget ? 1.5 : 1}
                style={{
                  transform:     `translate(${tx}px, ${ty}px)`,
                  transition:    "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* ── Hint pulse ─────────────────────────────────────────────────
              A grey circle that plays the two-brighten animation and then
              disappears.  Keyed on hintKey so each scheduled pulse remounts
              the element and restarts the CSS animation from 0%.           */}
          {mode === "compact" && hintKey > 0 && (
            <circle
              key={`hint-${hintKey}`}
              cx={CX} cy={CY} r={RI - 2}
              fill="#9ca3af"
              style={{
                animation:     "donutHintPulse 1.5s ease forwards",
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── Compact centre text (mode 1) ───────────────────────────────
              Font sizes are written in 320×320 SVG units.  At 180 px display
              they scale ×0.5625, matching the original 180-px SVG values.
                32 SVG → 18 px displayed   (was fontSize 18 in old 180 viewBox)
                18 SVG →  10 px displayed   (was fontSize 9  in old 180 viewBox) */}
          <g
            style={{
              opacity:       expanded ? 0 : 1,
              transition:    `opacity ${expanded ? "0.18s" : "0.28s 0.28s"} ease`,
              pointerEvents: "none",
            }}
          >
            {budgetUsedPct !== null && (
              <>
                <text x={CX} y={CY - 10}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="32" fontWeight="700" fill="#ffffff">
                  {budgetUsedPct}%
                </text>
                <text x={CX} y={CY + 16}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="18" fill="#6b7280">
                  of budget
                </text>
              </>
            )}
          </g>

          {/* ── Expanded centre text (mode 2) ──────────────────────────────
              Delayed 0.25 s so the donut has already grown before text appears. */}
          <g
            style={{
              opacity:       expanded ? 1 : 0,
              transition:    `opacity ${expanded ? "0.28s 0.25s" : "0.15s"} ease`,
              pointerEvents: "none",
            }}
          >
            {selectedLegend ? (
              <>
                <circle cx={CX} cy={CY} r={RI - 4}
                  fill={selectedLegend.color + "18"}
                  style={{ pointerEvents: "none" }} />
                <text x={CX} y={CY - 24}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight="600" fill="#ffffff">
                  {selectedLegend.name.length > 14
                    ? selectedLegend.name.slice(0, 13) + "…"
                    : selectedLegend.name}
                </text>
                <text x={CX} y={CY - 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="16" fontWeight="700" fill="#ffffff">
                  {fmtAmt(selectedLegend.spent, currency)}
                </text>
                {selectedLegend.budget > 0 && (
                  <text x={CX} y={CY + 18}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="11" fill={selectedLegend.isOverBudget ? "#f87171" : "#6b7280"}>
                    {Math.round((selectedLegend.spent / selectedLegend.budget) * 100)}% of budget
                  </text>
                )}
                <text x={CX} y={CY + 36}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fill="#4b5563">
                  tap again to close
                </text>
              </>
            ) : (
              <>
                {budgetUsedPct !== null && (
                  <>
                    <text x={CX} y={CY - 10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="28" fontWeight="700" fill="#ffffff">
                      {budgetUsedPct}%
                    </text>
                    <text x={CX} y={CY + 16}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="11" fill="#6b7280">
                      of budget used
                    </text>
                    <text x={CX} y={CY + 32}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="9" fill="#374151">
                      {fmtAmt(totalSpent, currency)} / {fmtAmt(totalBudget, currency)}
                    </text>
                  </>
                )}
                <text x={CX} y={CY + 50}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="8" fill="#374151">
                  ×× to exit
                </text>
              </>
            )}
          </g>

          {/* ── Centre tap target — always LAST so it sits on top ──────────
              Covers the inner hole; double-tap toggles modes.              */}
          <circle
            cx={CX} cy={CY} r={RI - 2}
            fill="transparent"
            role="button"
            aria-label={expanded ? "Double-tap to collapse chart" : "Double-tap to expand chart"}
            style={{ cursor: "pointer" }}
            onClick={handleCenterTap}
          />
        </svg>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────────
          Exits immediately (opacity fades in 0.15 s) so it vanishes before the
          donut starts growing.  Enters with a 200 ms delay and 280 ms fade so
          the donut has already shrunk close to its compact size first.       */}
      <div
        style={{
          maxWidth:   expanded ? 0 : 220,
          marginLeft: expanded ? 0 : 12,
          opacity:    expanded ? 0 : 1,
          overflow:   "hidden",
          flexShrink: 1,
          transition: expanded ? LEGEND_EXIT_TRANS : LEGEND_ENTER_TRANS,
        }}
      >
        {/* Fixed inner width prevents items from squishing during the animation */}
        <div style={{ width: 160 }} className="space-y-2.5">
          {legend.map(item => {
            const pct    = item.budget > 0 ? Math.round((item.spent / item.budget) * 100) : null;
            const isSel  = selectedCat === item.catKey;
            const dimmed = selectedCat !== null && !isSel;
            return (
              <button
                key={item.catKey}
                className="w-full text-left"
                style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 0.2s ease" }}
                onClick={() => handleSegmentClick(item.catKey)}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground truncate leading-tight">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 ml-4">
                  <span className="text-xs font-semibold leading-tight">
                    {fmtAmt(item.spent, currency)}
                  </span>
                  {pct !== null && (
                    <span
                      className="text-[11px] font-medium leading-tight"
                      style={{ color: item.isOverBudget ? "#f87171" : "#6b7280" }}
                    >
                      ({pct}%)
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
