import { useEffect, useId, useRef, useState } from "react";
import { fmtAmt, checkDonutWiggleDue, loadPrefs } from "@/lib/prefs";
import { t } from "@/lib/i18n";

// ─── Inject hint-pulse keyframes once ────────────────────────────────────────

// Four single-blink keyframes — one per opacity level.
// Each blink lasts 0.224 s (rise to peak at 50 %, fall back to 0 at 100 %).
// Two circles are rendered per hint: Circle A plays immediately, Circle B is
// delayed 0.304 s (= the 80 ms gap between blinks, held by fill-mode: both).
// Brightness crescendo across the 3 scheduled hint firings:
//   Pulse 1: A = 0.37, B = 0.45   ← starts at what was formerly the 4th tone
//   Pulse 2: A = 0.45, B = 0.53   ← A opens at B's previous level (+0.08 rule)
//   Pulse 3: A = 0.53, B = 0.61   ← A opens at B's previous level (+0.08 rule)
// Radii are randomised at fire time (r1 < r2, both ≥ 65 % of the hole radius).
// A feGaussianBlur SVG filter softens each circle's edge into a warm glow.
const HINT_KF_ID = "donut-hint-kf";
if (typeof document !== "undefined" && !document.getElementById(HINT_KF_ID)) {
  const s = document.createElement("style");
  s.id = HINT_KF_ID;
  s.textContent = `
    @keyframes donutBlink037 {
      0%   { opacity: 0;    }
      50%  { opacity: 0.37; }
      100% { opacity: 0;    }
    }
    @keyframes donutBlink045 {
      0%   { opacity: 0;    }
      50%  { opacity: 0.45; }
      100% { opacity: 0;    }
    }
    @keyframes donutBlink053 {
      0%   { opacity: 0;    }
      50%  { opacity: 0.53; }
      100% { opacity: 0;    }
    }
    @keyframes donutBlink061 {
      0%   { opacity: 0;    }
      50%  { opacity: 0.61; }
      100% { opacity: 0;    }
    }
  `;
  document.head.appendChild(s);
}

// Gem-flash keyframe for larder-designated donut segments.
// The flash occupies only the first 25 % of the animation duration so that
// sequential delays (idx * step) produce non-overlapping one-by-one firing
// regardless of how many designated segments there are.
const GEM_KF_ID = "donut-gem-kf";
if (typeof document !== "undefined" && !document.getElementById(GEM_KF_ID)) {
  const s = document.createElement("style");
  s.id = GEM_KF_ID;
  s.textContent = `
    @keyframes donutGemFlash {
      0%   { opacity: 0;    transform: scale(0.1)  rotate(0deg);  }
      6%   { opacity: 1;    transform: scale(1)    rotate(0deg);  }
      12%  { opacity: 0.5;  transform: scale(0.85) rotate(45deg); }
      18%  { opacity: 0.9;  transform: scale(1)    rotate(0deg);  }
      25%  { opacity: 0;    transform: scale(0.1)  rotate(0deg);  }
      100% { opacity: 0;    transform: scale(0.1)  rotate(0deg);  }
    }
  `;
  document.head.appendChild(s);
}

// Circle A / B keyframe names indexed by pulse (0-based)
const HINT_ANIM_A = ["donutBlink037", "donutBlink045", "donutBlink053"] as const;
const HINT_ANIM_B = ["donutBlink045", "donutBlink053", "donutBlink061"] as const;

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
  /** True when this item represents a recurring payment that has been applied this month */
  isRecurringApplied?: boolean;
  /** True when this recurring payment is designated to also add to the user's Larder */
  isLarderDesignated?: boolean;
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
  startDeg: number; endDeg: number; groupFraction: number;
};

type LegendItem = {
  catKey: string; color: string; name: string;
  spent: number; budget: number; isOverBudget: boolean;
  isRecurringApplied: boolean;
  isLarderDesignated: boolean;
};

function buildChart(
  spending: SpendingItem[],
  totalBudget: number,
  selectedCat: string | null,
): { segs: Seg[]; groupBorders: GroupBorder[]; legend: LegendItem[]; sumBudgets: number } {
  const CAT_GAP = 2.5;

  const budgeted   = spending.filter(s => s.budget != null && s.budget > 0);
  const unbudgeted = spending.filter(s => s.budget == null || s.budget <= 0);

  const sumBudgets  = budgeted.reduce((a, s) => a + (s.budget ?? 0), 0);
  // Round to cents so floating-point noise (e.g. 11052 - 11051.9997 = 0.0003)
  // doesn't produce a near-zero budget that makes the % blow up to 196000 %.
  const uncatBudget = Math.max(0, Math.round((totalBudget - sumBudgets) * 100) / 100);
  const uncatSpent  = unbudgeted.reduce((a, s) => a + s.total, 0);
  const uncatRemain = Math.max(0, uncatBudget - uncatSpent);
  const effectiveTotal = Math.max(sumBudgets + uncatBudget, 1);

  type Group = {
    catKey: string; color: string; name: string; spent: number; budget: number;
    isRecurringApplied: boolean;
    isLarderDesignated: boolean;
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

    const isRecurringApplied = s.isRecurringApplied ?? false;
    const isLarderDesignated = s.isLarderDesignated ?? false;
    if (over) {
      groups.push({ catKey, color, name, spent, budget, isRecurringApplied, isLarderDesignated,
        parts: [{ id: `${catKey}-over`, fraction: budget / effectiveTotal, fill: color, isOverBudget: true }] });
    } else {
      const spentFrac  = spent / effectiveTotal;
      const remainFrac = (budget - spent) / effectiveTotal;
      const parts = [];
      if (spentFrac  > 0.001) parts.push({ id: `${catKey}-spent`,  fraction: spentFrac,  fill: color,                    isOverBudget: false });
      if (remainFrac > 0.001) parts.push({ id: `${catKey}-remain`, fraction: remainFrac, fill: hexDarken(color, 0.52),   isOverBudget: false });
      groups.push({ catKey, color, name, spent, budget, isRecurringApplied, isLarderDesignated, parts });
    }
  }

  // Show uncategorised segment whenever there is spending, even when all
  // budget is allocated (budget = 0 → no percentage shown in the legend).
  if (uncatBudget > 0 || uncatSpent > 0) {
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
        spent: uncatSpent, budget: uncatBudget, isRecurringApplied: false, isLarderDesignated: false, parts });
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
      startDeg: groupStartDeg,
      endDeg: groupEndDeg,
      groupFraction: groupDeg / 360,
    });

    cursor += groupDeg + CAT_GAP;
  }

  const legend: LegendItem[] = groups
    .filter(g => g.spent > 0 || g.budget > 0)
    .map(g => ({ catKey: g.catKey, color: g.color, name: g.name, spent: g.spent,
      budget: g.budget, isOverBudget: g.spent > g.budget && g.budget > 0,
      isRecurringApplied: g.isRecurringApplied, isLarderDesignated: g.isLarderDesignated }));

  return { segs, groupBorders, legend, sumBudgets };
}

// ─── Animation constants ──────────────────────────────────────────────────────

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const DUR  = "0.48s";
const TRANS = `${DUR} ${EASE}`;

// 2→1: SVG shrinks first (no delay, 0.48 s), legend slides in after 0.3 s.
// 1→2: legend slides out first (no delay, 0.48 s), SVG grows after 0.3 s —
//       the exact time-reverse, both using concrete px widths so the transition
//       has a stable start and end point (no layout jump).
const LEGEND_EXIT_TRANS  = `max-width ${TRANS}, margin-left ${TRANS}, opacity 0.15s ease`;
const LEGEND_ENTER_TRANS = `max-width ${DUR} 0.3s ${EASE}, margin-left ${DUR} 0.3s ${EASE}, opacity 0.28s ease 0.38s`;

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  spending: SpendingItem[];
  totalBudget: number;
  currency: string;
  /** Pass true once the user has ≥1 recorded category or recurring payment.
   *  The segment-wiggle hint won't fire until this is true. */
  hasData?: boolean;
  /** Start the chart in this mode; defaults to "compact". Used by drill-downs
   *  that want to preserve the household donut's current view mode. */
  initialMode?: "compact" | "expanded";
  /** Called when the user double-taps center to toggle mode. Lets the parent
   *  (e.g. HouseholdDonutChart) stay in sync and persist the choice. */
  onModeChange?: (mode: "compact" | "expanded") => void;
  /** Pre-measured container width from the parent. When provided the width
   *  state is seeded with this value so there is no initial growing animation
   *  when the chart mounts directly in expanded mode (e.g. drill-down). */
  initialContainerWidth?: number;
};

export default function DonutBudgetChart({ spending, totalBudget, currency, hasData = false, initialMode = "compact", onModeChange, initialContainerWidth }: Props) {
  const uid = useId().replace(/:/g, "");
  const idRedGlow  = `redGlow-${uid}`;
  const idHintGrad = `hintGrad-${uid}`;
  const idHintBlur = `hintBlur-${uid}`;

  const [selectedCat,    setSelectedCat]    = useState<string | null>(null);
  const [mode,           setMode]           = useState<"compact" | "expanded">(initialMode);
  // Seed with the parent's measured width when drilling in so there is no
  // "grow from 320→actual" animation on the first render.
  const [containerWidth, setContainerWidth] = useState(initialContainerWidth ?? 320);
  // True once the ResizeObserver has fired (or if we were pre-seeded by the parent).
  // Suppress the width transition until then so the first render has no animation.
  const [hasMeasured, setHasMeasured] = useState(initialContainerWidth != null);
  // Bump triggers hint re-mount → CSS animation restarts
  const [hintKey, setHintKey] = useState(0);
  const lastCenterTapRef  = useRef<number>(0);
  // Pending hint-pulse timer IDs — exposed here so a double-tap can cancel them
  const hintTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef     = useRef<HTMLDivElement>(null);
  // Random radii for the two circles in each hint firing (r1 < r2, both ≥ 65 % of hole)
  const hintRadiiRef = useRef<{ r1: number; r2: number }>({ r1: RI - 2, r2: RI - 2 });
  // Refs for the two <g> elements that receive the sequential wiggle animation
  const wiggleGroupRef  = useRef<SVGGElement>(null); // first group (clockwise)
  const wiggleGroup2Ref = useRef<SVGGElement>(null); // 4th group (or 3rd / 2nd fallback)
  // midDeg of each wiggle group — updated every render so effect reads fresh values at fire time
  const firstSegMidDegRef  = useRef<number>(0);
  const secondSegMidDegRef = useRef<number>(0);
  // Latest hasData value — updated every render, read inside the timer closure
  const hasDataRef = useRef<boolean>(false);

  const { segs, groupBorders, legend, sumBudgets } = buildChart(spending, totalBudget, selectedCat);

  // Keep refs current every render so timer callbacks read the latest values at fire time.
  // wiggle1 = first group; wiggle2 = 4th group clockwise (fallback: 3rd, 2nd, none if <2 groups)
  const _wiggle2Border = groupBorders.length >= 2
    ? (groupBorders[3] ?? groupBorders[2] ?? groupBorders[1])
    : undefined;
  firstSegMidDegRef.current  = groupBorders[0]?.midDeg ?? 0;
  secondSegMidDegRef.current = _wiggle2Border?.midDeg ?? 0;
  const wiggleCatKey2        = _wiggle2Border?.catKey ?? null;
  hasDataRef.current         = hasData;

  const totalSpent    = spending.reduce((a, s) => a + s.total, 0);
  const budgetUsedPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;
  const selectedLegend = legend.find(l => l.catKey === selectedCat) ?? null;
  const expanded       = mode === "expanded";

  // ── Track container width so both ends of the SVG transition are concrete px
  //    values — avoids the layout jump caused by animating to/from "100%".   ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(Math.round(entries[0].contentRect.width));
      setHasMeasured(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Hint pulse: schedule on mount (= each time Dashboard tab enters) ──────
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    const MIN_R   = Math.round(0.65 * (RI - 2)); // ≈ 47 SVG units
    const MAX_R   = RI - 2;                       //   73 SVG units
    const MIN_GAP = 5;                            // r2 must exceed r1 by at least this
    // 3 pulses: at 3 s, 8 s, 13 s
    hintTimersRef.current = [];
    for (let i = 0; i < 3; i++) {
      hintTimersRef.current.push(setTimeout(() => {
        // r1 ∈ [MIN_R, MAX_R − MIN_GAP], r2 ∈ [r1 + MIN_GAP, MAX_R]
        const r1 = MIN_R + Math.floor(Math.random() * (MAX_R - MIN_GAP - MIN_R + 1));
        const r2 = Math.min(r1 + MIN_GAP + Math.floor(Math.random() * (MAX_R - r1 - MIN_GAP + 1)), MAX_R);
        hintRadiiRef.current = { r1, r2 };
        setHintKey(k => k + 1);
      }, 3_000 + i * 5_000));
    }
    return () => hintTimersRef.current.forEach(clearTimeout);
  }, []);

  // ── Two-segment sequential wiggle: fires 4 s after mount ─────────────────
  // Uses the Web Animations API so translate directions are computed from each
  // group's actual midDeg at fire time — CSS keyframes can't do dynamic values.
  //
  // Two-beat "detach" per group (mirrors the transaction-swipe wiggle):
  //   beat 1 → 65 % of the click-expand distance, snap back
  //   beat 2 → 38 % of the click-expand distance, settle to 0
  //
  // Occurrence rules (same cadence as swipe hint):
  //   • Only fires when hasData is true (≥1 category or recurring payment).
  //   • First time ever for this user → fires.
  //   • Otherwise only fires again after ≥ 1 week.
  //
  // Sequence: group1 wiggles first (700 ms), then group2 wiggles 200 ms later.
  // If there is no group2 (only one segment in the chart), skip the animation entirely.
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    function wiggleEl(el: SVGGElement, midDeg: number) {
      const midRad = ((midDeg - 90) * Math.PI) / 180;
      const px1 = EXPAND * 0.65 * Math.cos(midRad);
      const py1 = EXPAND * 0.65 * Math.sin(midRad);
      const px2 = EXPAND * 0.38 * Math.cos(midRad);
      const py2 = EXPAND * 0.38 * Math.sin(midRad);
      el.animate(
        [
          { transform: "translate(0px, 0px)",                         easing: "cubic-bezier(0.34,1.56,0.64,1)" },
          { transform: `translate(${px1}px, ${py1}px)`, offset: 0.28, easing: "cubic-bezier(0.4,0,0.2,1)" },
          { transform: "translate(0px, 0px)",            offset: 0.50, easing: "cubic-bezier(0.34,1.56,0.64,1)" },
          { transform: `translate(${px2}px, ${py2}px)`, offset: 0.72, easing: "cubic-bezier(0.4,0,0.2,1)" },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: 700, fill: "none" },
      );
    }

    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = setTimeout(() => {
      // Guard: need data and a second group to animate; consume the weekly slot only when firing.
      if (!hasDataRef.current) return;
      if (!wiggleGroup2Ref.current) return; // only 1 group → skip entirely
      if (!checkDonutWiggleDue()) return;

      const el1 = wiggleGroupRef.current;
      const el2 = wiggleGroup2Ref.current;
      if (el1) wiggleEl(el1, firstSegMidDegRef.current);
      t2 = setTimeout(() => {
        if (el2) wiggleEl(el2, secondSegMidDegRef.current);
      }, 900); // 700 ms group1 duration + 200 ms gap
    }, 4_000);

    return () => {
      clearTimeout(t1);
      if (t2 !== null) clearTimeout(t2);
    };
  }, []);

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleSegmentClick(catKey: string) {
    setSelectedCat(prev => (prev === catKey ? null : catKey));
  }

  function handleCenterTap() {
    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      // Double-tap: toggle mode AND cancel any pending/active hint pulses
      const nextMode = mode === "compact" ? "expanded" : "compact";
      setMode(nextMode);
      onModeChange?.(nextMode);
      setSelectedCat(null);
      lastCenterTapRef.current = 0;
      // Clear scheduled hint timers so pulses 2 and 3 never fire
      hintTimersRef.current.forEach(clearTimeout);
      hintTimersRef.current = [];
      // Reset hintKey to 0 so any currently-animating pulse disappears immediately
      setHintKey(0);
    } else {
      lastCenterTapRef.current = now;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        display:    "flex",
        alignItems: "center",
        width:      "100%",
      }}
    >
      {/* ── SVG wrapper ─────────────────────────────────────────────────────
          Width drives visual scale:
          • compact  → 180 px
          • expanded → containerWidth px  (measured, never "100%")
          Both ends are concrete pixel values so the CSS transition has a
          stable start and end — no layout jump, no "growing from a corner".
          2→1: shrinks immediately (no delay).
          1→2: delayed 0.3 s so legend collapses first (time-reverse of 2→1). */}
      <div
        style={{
          width:      expanded ? containerWidth : 180,
          flexShrink: 0,
          // Suppress the transition until we've measured the real container width.
          // Without this, mounting in expanded mode animates from the seed value
          // to the measured value, producing a visible "grow" on entry.
          transition: hasMeasured
            ? (expanded ? `width ${DUR} 0.3s ${EASE}` : `width ${TRANS}`)
            : "none",
        }}
      >
        <svg
          width="100%"
          viewBox="0 0 320 320"
          style={{ overflow: "visible", display: "block" }}
          aria-label={expanded ? "Spending donut — expanded" : "Spending donut"}
        >
          <defs>
            <filter id={idRedGlow} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feColorMatrix in="blur" type="matrix"
                values="1.5 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 0"
                result="redBlur" />
              <feMerge>
                <feMergeNode in="redBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Hint pulse gradient: warm-dark centre fading to near-black edge */}
            <radialGradient id={idHintGrad} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#4b5563" />
              <stop offset="60%"  stopColor="#374151" />
              <stop offset="100%" stopColor="#1f2937" />
            </radialGradient>
            {/* Soft-edge blur applied to each hint circle — stdDeviation in SVG
                user units; at 180 px compact display ≈ 5.6 CSS px, enough to
                feather the disc into a warm glow without losing the shape.    */}
            <filter id={idHintBlur} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
            {/* Larder-designated sparkle gradients — shared by all spark <rect> arms */}
            <linearGradient id={`sp-h-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="white" stopOpacity="0" />
              <stop offset="50%"  stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`sp-v-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="white" stopOpacity="0" />
              <stop offset="50%"  stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <filter id={`sp-glow-${uid}`} x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
            </filter>
          </defs>

          {/* Fill + border paths.
              The first group's fills AND border share one <g ref={wiggleGroupRef}>
              so the Web Animations API can translate the whole unit outward as one
              piece — identical to the click-expand behaviour but driven by .animate(). */}
          {(() => {
            const wiggleCatKey = segs[0]?.catKey ?? null;

            // Helper: path props for a fill segment
            function fillPath(seg: Seg) {
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
                    filter:     seg.isOverBudget ? `url(#${idRedGlow})` : "none",
                    cursor:     "pointer",
                  }}
                  onClick={() => handleSegmentClick(seg.catKey)}
                />
              );
            }

            // Helper: border for a single part (used only while the group is
            // detached — each part gets its own border, tracking its own
            // translate offset, in the same lighter-tone-of-category-color style).
            function partBorderPath(seg: Seg, groupColor: string, groupIsOverBudget: boolean) {
              const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
              const tx = EXPAND * Math.cos(midRad);
              const ty = EXPAND * Math.sin(midRad);
              return (
                <path
                  key={`border-${seg.id}`}
                  d={seg.d}
                  fill="none"
                  stroke={groupIsOverBudget ? "#ef4444" : groupColor + "90"}
                  strokeWidth={groupIsOverBudget ? 1.5 : 1}
                  style={{
                    transform:     `translate(${tx}px, ${ty}px)`,
                    transition:    "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    pointerEvents: "none",
                  }}
                />
              );
            }

            // Helper: border for a whole (non-detached) group — one border
            // in a lighter tone of the category color around the entire arc.
            function groupBorderPath(gb: GroupBorder) {
              return (
                <path
                  key={`border-${gb.catKey}`}
                  d={gb.d}
                  fill="none"
                  stroke={gb.isOverBudget ? "#ef4444" : gb.groupColor + "90"}
                  strokeWidth={gb.isOverBudget ? 1.5 : 1}
                  style={{
                    transform:     "translate(0px, 0px)",
                    transition:    "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    pointerEvents: "none",
                  }}
                />
              );
            }

            // Border(s) for a group: split into per-part borders once detached
            // (selected), otherwise a single border around the whole arc.
            function borderPath(gb: GroupBorder) {
              const isSel = selectedCat === gb.catKey;
              if (!isSel) return [groupBorderPath(gb)];
              const groupSegs = segs.filter(s => s.catKey === gb.catKey);
              return groupSegs.map(s => partBorderPath(s, gb.groupColor, gb.isOverBudget));
            }

            // Three buckets: wiggle1 (first group), wiggle2 (4th/3rd/2nd fallback), rest
            const group1Fills  = segs.filter(s => s.catKey === wiggleCatKey).map(fillPath);
            const group1Border = groupBorders.find(gb => gb.catKey === wiggleCatKey);
            const group2Fills  = wiggleCatKey2 ? segs.filter(s => s.catKey === wiggleCatKey2).map(fillPath) : [];
            const group2Border = wiggleCatKey2 ? groupBorders.find(gb => gb.catKey === wiggleCatKey2) : undefined;
            const restFills    = segs.filter(s => s.catKey !== wiggleCatKey && s.catKey !== wiggleCatKey2).map(fillPath);
            const restBorders  = groupBorders.filter(gb => gb.catKey !== wiggleCatKey && gb.catKey !== wiggleCatKey2).flatMap(borderPath);

            return (
              <>
                {/* Wiggle group 1: first clockwise group */}
                {wiggleCatKey !== null && (
                  <g ref={wiggleGroupRef}>
                    {group1Fills}
                    {group1Border && borderPath(group1Border)}
                  </g>
                )}
                {/* Wiggle group 2: 4th clockwise group (or 3rd / 2nd fallback) */}
                {wiggleCatKey2 !== null && (
                  <g ref={wiggleGroup2Ref}>
                    {group2Fills}
                    {group2Border && borderPath(group2Border)}
                  </g>
                )}
                {/* Remaining groups */}
                {restFills}
                {restBorders}
              </>
            );
          })()}

          {/* ── Larder-designated segment sparkles ─────────────────────────
              Disabled: set DONUT_SPARKLES_ENABLED = true to restore.
              Diamond count scales with segment size:
                ≥51 % → 5, ≥33 % → 4, ≥25 % → 3, ≥15 % → 2, else → 1.
              Sparkles within a segment share the same animation delay.
              Sequential firing across segments: cycle = segCount × 1.5 s,
              delay per segment = segIdx × 1.5 s; the keyframe flashes only
              in its first 25 % so segments never overlap.
              Arms use gradient <rect> elements; centre has a glow layer.
              transform-box:fill-box + transform-origin:center ensure the
              scale/rotate keyframe pivots on each sparkle's own centre.   */}
          {(() => {
            const DONUT_SPARKLES_ENABLED = false; // set true to re-enable
            if (!DONUT_SPARKLES_ENABLED || loadPrefs().disableAnimations) return null;
            const larderSegs = groupBorders.filter(
              gb => legend.find(l => l.catKey === gb.catKey)?.isLarderDesignated,
            );
            if (!larderSegs.length) return null;
            const STEP = 1.5; // seconds per sparkle slot
            const cycleDur = Math.max(larderSegs.length, 1) * STEP;
            const hs = 11; // half-arm length in SVG user units

            const allSparkles: React.ReactElement[] = [];

            larderSegs.forEach((gb, segIdx) => {
              // Use share of drawable arc (excluding gaps) so thresholds match
              // visual proportion regardless of how many categories exist.
              const drawDegTotal = 360 - groupBorders.length * 2.5;
              const pct = drawDegTotal > 0 ? (gb.groupFraction * 360 / drawDegTotal) * 100 : 0;
              const sparkleCount = pct >= 51 ? 5 : pct >= 33 ? 4 : pct >= 25 ? 3 : pct >= 15 ? 2 : 1;
              const isSelected   = selectedCat === gb.catKey;
              const outerR       = isSelected ? RO + EXPAND : RO;
              const delay        = `${segIdx * STEP}s`;

              // Distribute sparkles evenly along the segment arc (10 % margin each side)
              const angles = Array.from({ length: sparkleCount }, (_, i) => {
                if (sparkleCount === 1) return gb.midDeg;
                const margin  = (gb.endDeg - gb.startDeg) * 0.1;
                const usable  = (gb.endDeg - gb.startDeg) - 2 * margin;
                return gb.startDeg + margin + (i / (sparkleCount - 1)) * usable;
              });

              angles.forEach((angleDeg, i) => {
                const rad     = ((angleDeg - 90) * Math.PI) / 180;
                const r       = (RI + outerR) / 2;
                const offsetX = isSelected ? EXPAND * Math.cos(rad) : 0;
                const offsetY = isSelected ? EXPAND * Math.sin(rad) : 0;
                const sx      = CX + r * Math.cos(rad) + offsetX;
                const sy      = CY + r * Math.sin(rad) + offsetY;
                allSparkles.push(
                  <g
                    key={`larder-spark-${gb.catKey}-${i}`}
                    transform={`translate(${sx}, ${sy})`}
                    style={{ pointerEvents: "none" }}
                  >
                    {/* Inner g handles scale/rotate animation independently from the
                        outer SVG transform so CSS transforms don't override the position. */}
                    <g
                      style={{
                        transformBox:    "fill-box" as any,
                        transformOrigin: "center",
                        animation: `donutGemFlash ${cycleDur}s ease-in-out ${delay} infinite`,
                      }}
                    >
                      {/* horizontal gradient arm */}
                      <rect x={-hs} y={-0.5} width={hs * 2} height={1} fill={`url(#sp-h-${uid})`} />
                      {/* vertical gradient arm */}
                      <rect x={-0.5} y={-hs} width={1} height={hs * 2} fill={`url(#sp-v-${uid})`} />
                      {/* glow halo */}
                      <circle cx={0} cy={0} r={3} fill="white" opacity={0.25} filter={`url(#sp-glow-${uid})`} />
                      {/* sharp centre dot */}
                      <circle cx={0} cy={0} r={1.5} fill="white" />
                    </g>
                  </g>,
                );
              });
            });

            return allSparkles;
          })()}

          {/* ── Hint pulse ─────────────────────────────────────────────────
              Two circles per firing, keyed on hintKey so they remount and
              restart on each scheduled pulse.
              Circle A (smaller r, dimmer): plays immediately.
              Circle B (larger r, brighter): delayed 0.304 s — fill-mode:both
              holds it at opacity 0 during the gap, then it blooms.
              Both circles get the feGaussianBlur filter for soft edges.      */}
          {mode === "compact" && hintKey > 0 && (() => {
            const idx  = (hintKey - 1) % 3;
            const { r1, r2 } = hintRadiiRef.current;
            return (
              <>
                <circle
                  key={`hint-a-${hintKey}`}
                  cx={CX} cy={CY} r={r1}
                  fill={`url(#${idHintGrad})`}
                  filter={`url(#${idHintBlur})`}
                  style={{
                    animation:     `${HINT_ANIM_A[idx]} 0.224s ease 0s both`,
                    pointerEvents: "none",
                  }}
                />
                <circle
                  key={`hint-b-${hintKey}`}
                  cx={CX} cy={CY} r={r2}
                  fill={`url(#${idHintGrad})`}
                  filter={`url(#${idHintBlur})`}
                  style={{
                    animation:     `${HINT_ANIM_B[idx]} 0.224s ease 0.304s both`,
                    pointerEvents: "none",
                  }}
                />
              </>
            );
          })()}

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
                  {t("donut.of_budget")}
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
                {selectedLegend.catKey.startsWith("rp-") ? (
                  <>
                    <text x={CX} y={CY + 13}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="10" fill="#6b7280">
                      {t("donut.rp_type")}
                    </text>
                    <text x={CX} y={CY + 26}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="10" fontWeight="600" fill={selectedLegend.isRecurringApplied ? "#4ade80" : "#9ca3af"}>
                      {selectedLegend.isRecurringApplied ? t("donut.rp_paid") : t("donut.rp_not_paid")}
                    </text>
                  </>
                ) : selectedLegend.budget > 0 && (
                  <text x={CX} y={CY + 18}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="11" fill={selectedLegend.isOverBudget ? "#f87171" : "#6b7280"}>
                    {Math.round((selectedLegend.spent / selectedLegend.budget) * 100)}% {t("donut.of_its_budget")}
                  </text>
                )}
                <text x={CX} y={CY + 37}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fill="#4b5563">
                  {t("donut.tap_to_close_line1")}
                </text>
                {t("donut.tap_to_close_line2") && (
                  <text x={CX} y={CY + 48}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fill="#4b5563">
                    {t("donut.tap_to_close_line2")}
                  </text>
                )}
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
                      {t("donut.of_budget_used")}
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
                  {t("donut.xx_to_exit")}
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
            aria-label={expanded ? t("donut.collapse_label") : t("donut.expand_label")}
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
            const pct    = (item.budget > 0 && !(item.catKey === "cat-uncat" && Math.abs(totalBudget - sumBudgets) <= 1.00))
              ? Math.round((item.spent / item.budget) * 100) : null;
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
                  {item.catKey.startsWith("rp-") ? (
                    item.isRecurringApplied && (
                      <span className="text-[13px] font-bold leading-tight" style={{ color: "#4ade80" }}>✓</span>
                    )
                  ) : pct !== null && (
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
