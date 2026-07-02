import { useState } from "react";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpendingItem = {
  categoryId: number | null;
  categoryName: string | null;
  total: number;
  budget: number | null;
  categoryColor: string | null;
  count: number;
  /** Optional override for the catKey used in the donut chart (e.g. for recurring payments) */
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

const UNCAT_SPENT_COLOR = "#9ca3af";     // light grey  — uncategorised spent
const UNCAT_REMAIN_COLOR = "#374151";    // dark  grey  — uncategorised remaining

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
  id: string;
  catKey: string;
  d: string;
  fill: string;
  isOverBudget: boolean;
  midDeg: number;
};

type LegendItem = {
  catKey: string;
  color: string;
  name: string;
  spent: number;
  budget: number;
  isOverBudget: boolean;
};

function buildChart(
  spending: SpendingItem[],
  totalBudget: number,
  currency: string,
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  selectedCat: string | null,
): { segs: Seg[]; legend: LegendItem[] } {
  const CAT_GAP = 2.5; // degrees gap between different categories
  const EXPAND = 5;    // extra outer-radius px for selected segment

  // Split spending into budgeted categories vs unbudgeted
  const budgeted = spending.filter(s => s.budget != null && s.budget > 0);
  const unbudgeted = spending.filter(s => s.budget == null || s.budget <= 0);

  const sumBudgets = budgeted.reduce((a, s) => a + (s.budget ?? 0), 0);
  const uncatBudget = Math.max(0, totalBudget - sumBudgets);
  const uncatSpent = unbudgeted.reduce((a, s) => a + s.total, 0);
  const uncatRemain = Math.max(0, uncatBudget - uncatSpent);

  // If category/RP budgets exceed the total budget, normalize fractions to the
  // actual sum so they always fit within 360° without overlapping.
  const effectiveTotal = Math.max(sumBudgets + uncatBudget, 1);

  type Group = {
    catKey: string;
    color: string;
    name: string;
    spent: number;
    budget: number;
    // segments within this group share the same catKey
    parts: Array<{ id: string; fraction: number; fill: string; isOverBudget: boolean }>;
  };

  const groups: Group[] = [];

  for (const s of budgeted) {
    const catKey = s._catKey ?? `cat-${s.categoryId ?? "null"}`;
    const color = s.categoryColor ?? "#818cf8";
    const spent = s.total;
    const budget = s.budget!;
    const over = spent > budget;

    const name = (!s.categoryName || s.categoryName === "Uncategorized")
      ? t("common.uncategorized")
      : s.categoryName;

    if (over) {
      // Single over-budget segment (full budget allocation)
      groups.push({
        catKey, color, name, spent, budget,
        parts: [{ id: `${catKey}-over`, fraction: budget / effectiveTotal, fill: color, isOverBudget: true }],
      });
    } else {
      const spentFrac = spent / effectiveTotal;
      const remainFrac = (budget - spent) / effectiveTotal;
      const parts = [];
      if (spentFrac > 0.001) parts.push({ id: `${catKey}-spent`, fraction: spentFrac, fill: color, isOverBudget: false });
      if (remainFrac > 0.001) parts.push({ id: `${catKey}-remain`, fraction: remainFrac, fill: hexDarken(color, 0.52), isOverBudget: false });
      groups.push({ catKey, color, name, spent, budget, parts });
    }
  }

  // Uncategorised group — only shown when the categories' budgets don't already
  // add up to (or exceed) the total budget. If they do, the user has intentionally
  // allocated everything and there's nothing meaningful left to call "uncategorised".
  if (sumBudgets < totalBudget && (uncatBudget > 0 || uncatSpent > 0)) {
    const catKey = "cat-uncat";
    const parts = [];
    const over = uncatSpent > uncatBudget;
    if (over || uncatBudget === 0) {
      // treat like over-budget but using grey
      const frac = uncatBudget > 0 ? uncatBudget / effectiveTotal : uncatSpent / effectiveTotal;
      parts.push({ id: "uncat-over", fraction: frac, fill: UNCAT_SPENT_COLOR, isOverBudget: uncatBudget > 0 && over });
    } else {
      const spentFrac = uncatSpent / effectiveTotal;
      const remainFrac = uncatRemain / effectiveTotal;
      if (spentFrac > 0.001) parts.push({ id: "uncat-spent", fraction: spentFrac, fill: UNCAT_SPENT_COLOR, isOverBudget: false });
      if (remainFrac > 0.001) parts.push({ id: "uncat-remain", fraction: remainFrac, fill: UNCAT_REMAIN_COLOR, isOverBudget: false });
    }
    if (parts.length > 0) {
      groups.push({
        catKey,
        color: UNCAT_SPENT_COLOR,
        name: t("common.uncategorized"),
        spent: uncatSpent,
        budget: uncatBudget,
        parts,
      });
    }
  }

  // Convert fractions → degrees and build SVG paths
  const totalGapDeg = CAT_GAP * groups.length;
  const drawDeg = 360 - totalGapDeg;

  const segs: Seg[] = [];
  let cursor = 0; // degrees from 12 o'clock

  for (const g of groups) {
    const groupDeg = g.parts.reduce((a, p) => a + p.fraction * drawDeg, 0);
    const isSelected = selectedCat === g.catKey;
    const outerR = isSelected ? ro + EXPAND : ro;

    let partCursor = cursor;
    for (const part of g.parts) {
      const partDeg = part.fraction * drawDeg;
      const startDeg = partCursor;
      const endDeg = partCursor + partDeg;
      const midDeg = (startDeg + endDeg) / 2;

      segs.push({
        id: part.id,
        catKey: g.catKey,
        d: arc(cx, cy, ri, outerR, startDeg, endDeg),
        fill: part.fill,
        isOverBudget: part.isOverBudget,
        midDeg,
      });

      partCursor = endDeg;
    }

    cursor += groupDeg + CAT_GAP;
  }

  const legend: LegendItem[] = groups
    .filter(g => g.spent > 0 || g.budget > 0)
    .map(g => ({
      catKey: g.catKey,
      color: g.color,
      name: g.name,
      spent: g.spent,
      budget: g.budget,
      isOverBudget: g.spent > g.budget && g.budget > 0,
    }));

  return { segs, legend };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  spending: SpendingItem[];
  totalBudget: number;
  currency: string;
};

export default function DonutBudgetChart({ spending, totalBudget, currency }: Props) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const cx = 100, cy = 100, ri = 46, ro = 80;
  const { segs, legend } = buildChart(spending, totalBudget, currency, cx, cy, ri, ro, selectedCat);

  function handleClick(catKey: string) {
    setSelectedCat(prev => (prev === catKey ? null : catKey));
  }

  const budgetUsedPct = totalBudget > 0
    ? Math.round((spending.reduce((a, s) => a + s.total, 0) / totalBudget) * 100)
    : null;

  return (
    <div className="flex items-center gap-3">
      {/* SVG Donut */}
      <div className="flex-shrink-0 relative" style={{ width: 200, height: 200 }}>
        <svg width="200" height="200" viewBox="0 0 200 200" style={{ overflow: "visible" }}>
          <defs>
            {/* stdDeviation kept small and filter region tight so glows on adjacent
                over-budget segments don't visually bleed into one another */}
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

          {segs.map(seg => {
            const isSelected = selectedCat === seg.catKey;
            const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
            const tx = isSelected ? 8 * Math.cos(midRad) : 0;
            const ty = isSelected ? 8 * Math.sin(midRad) : 0;
            return (
              <path
                key={seg.id}
                d={seg.d}
                fill={seg.fill}
                stroke={seg.isOverBudget ? "#ef4444" : seg.fill + "70"}
                strokeWidth={seg.isOverBudget ? 1.5 : 0.8}
                paintOrder="stroke"
                style={{
                  transform: `translate(${tx}px, ${ty}px)`,
                  transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease",
                  filter: seg.isOverBudget ? "url(#redGlow)" : "none",
                  cursor: "pointer",
                  outline: "none",
                }}
                onClick={() => handleClick(seg.catKey)}
              />
            );
          })}

          {/* Centre label */}
          {budgetUsedPct !== null && (
            <>
              <text
                x={cx} y={cx - 6}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="18" fontWeight="700" fill="#ffffff"
              >
                {budgetUsedPct}%
              </text>
              <text
                x={cx} y={cx + 13}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill="#6b7280"
              >
                of budget
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2.5 min-w-0">
        {legend.map(item => {
          const pct = item.budget > 0
            ? Math.round((item.spent / item.budget) * 100)
            : null;
          const isSelected = selectedCat === item.catKey;
          const dimmed = selectedCat !== null && !isSelected;
          return (
            <button
              key={item.catKey}
              className="w-full text-left"
              style={{
                opacity: dimmed ? 0.25 : 1,
                transition: "opacity 0.2s ease",
              }}
              onClick={() => handleClick(item.catKey)}
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
  );
}
