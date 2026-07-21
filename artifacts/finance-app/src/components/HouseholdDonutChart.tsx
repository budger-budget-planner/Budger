import { useEffect, useId, useRef, useState } from "react";
import { fmtAmt, checkDonutWiggleDue, loadPrefs } from "@/lib/prefs";
import { convertAmount } from "@/lib/rates";
import { t } from "@/lib/i18n";

// ─── Hint keyframes are injected globally by DonutBudgetChart — reuse them ───
// If DonutBudgetChart hasn't mounted first, inject them here too.
const HINT_KF_ID = "donut-hint-kf";
if (typeof document !== "undefined" && !document.getElementById(HINT_KF_ID)) {
  const s = document.createElement("style");
  s.id = HINT_KF_ID;
  s.textContent = `
    @keyframes donutBlink037 { 0% { opacity:0; } 50% { opacity:0.37; } 100% { opacity:0; } }
    @keyframes donutBlink045 { 0% { opacity:0; } 50% { opacity:0.45; } 100% { opacity:0; } }
    @keyframes donutBlink053 { 0% { opacity:0; } 50% { opacity:0.53; } 100% { opacity:0; } }
    @keyframes donutBlink061 { 0% { opacity:0; } 50% { opacity:0.61; } 100% { opacity:0; } }
  `;
  document.head.appendChild(s);
}

const HINT_ANIM_A = ["donutBlink037", "donutBlink045", "donutBlink053"] as const;
const HINT_ANIM_B = ["donutBlink045", "donutBlink053", "donutBlink061"] as const;

// ─── SVG constants (verbatim from DonutBudgetChart) ───────────────────────────
const CX = 160, CY = 160, RI = 75, RO = 128, EXPAND = 14;
const CAT_GAP = 2.5;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const DUR  = "0.48s";
const TRANS = `${DUR} ${EASE}`;
const LEGEND_EXIT_TRANS  = `max-width ${TRANS}, margin-left ${TRANS}, opacity 0.15s ease`;
const LEGEND_ENTER_TRANS = `max-width ${DUR} 0.3s ${EASE}, margin-left ${DUR} 0.3s ${EASE}, opacity 0.28s ease 0.38s`;

const ADDITIONAL_FUNDS_COLOR = "#6b7280";

// ─── Colour helper ────────────────────────────────────────────────────────────
function hexDarken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Arc math (verbatim from DonutBudgetChart) ────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arc(cx: number, cy: number, ri: number, ro: number, start: number, end: number): string {
  const sweep = Math.min(end - start, 359.99);
  const e = start + sweep;
  const s0 = polar(cx, cy, ro, start); const e0 = polar(cx, cy, ro, e);
  const s1 = polar(cx, cy, ri, start); const e1 = polar(cx, cy, ri, e);
  const lg = sweep > 180 ? 1 : 0;
  return `M${s0.x} ${s0.y} A${ro} ${ro} 0 ${lg} 1 ${e0.x} ${e0.y} L${e1.x} ${e1.y} A${ri} ${ri} 0 ${lg} 0 ${s1.x} ${s1.y}Z`;
}

// ─── Segment types ────────────────────────────────────────────────────────────
type Seg = { id: string; groupId: string; d: string; fill: string; isOverBudget: boolean; midDeg: number };
type GroupBorder = { groupId: string; d: string; groupColor: string; isOverBudget: boolean; midDeg: number; startDeg: number; endDeg: number };
type LegendItem = { groupId: string; color: string; name: string; spentInViewer: number; budgetInViewer: number | null; isOverBudget: boolean; isVirtual: boolean; userId: number };

// ─── Input type ───────────────────────────────────────────────────────────────
export type HouseholdMemberInput = {
  userId: number;
  name: string;
  memberColor: string;
  monthlySpent: number;
  totalBudget: number | null;
  currency: string;
  role: string;
  dashboardBlocked?: boolean;
};

// ─── Chart builder ────────────────────────────────────────────────────────────
function buildHouseholdChart(
  members: HouseholdMemberInput[],
  householdBudget: number | null,
  viewerCurrency: string,
  rates: Record<string, number> | null,
  selectedId: string | null,
): { segs: Seg[]; groupBorders: GroupBorder[]; legend: LegendItem[]; effectiveBudget: number; totalSpentV: number } {

  function toViewer(amount: number, currency: string): number {
    if (!rates || currency === viewerCurrency) return amount;
    return convertAmount(amount, currency, viewerCurrency, rates);
  }

  const memberData = members.map(m => ({
    ...m,
    spentV:  toViewer(m.monthlySpent, m.currency),
    budgetV: m.totalBudget != null ? toViewer(m.totalBudget, m.currency) : null,
    isVirtual: m.userId === -1,
    groupId: `member-${m.userId}`,
  }));

  const sumMemberBudgets = memberData.reduce((s, m) => s + (m.budgetV ?? 0), 0);
  const totalSpentV      = memberData.reduce((s, m) => s + m.spentV, 0);

  let effectiveBudget: number;
  if (householdBudget != null && householdBudget > 0) {
    effectiveBudget = householdBudget;
  } else if (sumMemberBudgets > 0) {
    effectiveBudget = sumMemberBudgets;
  } else {
    effectiveBudget = totalSpentV > 0 ? totalSpentV : 1;
  }

  type GroupDef = {
    groupId: string; color: string; name: string;
    spentInViewer: number; budgetInViewer: number | null;
    isOverBudget: boolean; isVirtual: boolean; userId: number;
    parts: Array<{ fraction: number; fill: string; isOverBudget: boolean }>;
  };

  const groups: GroupDef[] = [];

  for (const m of memberData) {
    const displayName = m.isVirtual ? t("hh.virtual_member_name") : m.name;

    if (m.budgetV == null) {
      // No budget set — spent arc only (or minimum-width placeholder)
      const frac = m.spentV > 0.001 ? Math.min(m.spentV / effectiveBudget, 1) : 1 / Math.max(members.length, 1) * 0.5;
      groups.push({
        groupId: m.groupId, color: m.memberColor, name: displayName,
        spentInViewer: m.spentV, budgetInViewer: null,
        isOverBudget: false, isVirtual: m.isVirtual, userId: m.userId,
        parts: [{ fraction: frac, fill: m.memberColor, isOverBudget: false }],
      });
    } else {
      const spent  = m.spentV;
      const budget = m.budgetV;
      const isOver = spent > budget && budget > 0;

      if (isOver) {
        const frac = budget > 0 ? budget / effectiveBudget : spent / effectiveBudget;
        groups.push({
          groupId: m.groupId, color: m.memberColor, name: displayName,
          spentInViewer: spent, budgetInViewer: budget,
          isOverBudget: true, isVirtual: m.isVirtual, userId: m.userId,
          parts: [{ fraction: Math.min(frac, 1), fill: m.memberColor, isOverBudget: true }],
        });
      } else {
        const spentFrac  = spent / effectiveBudget;
        const remainFrac = (budget - spent) / effectiveBudget;
        const parts: GroupDef["parts"] = [];
        if (spentFrac  > 0.001) parts.push({ fraction: spentFrac,  fill: m.memberColor,                 isOverBudget: false });
        if (remainFrac > 0.001) parts.push({ fraction: remainFrac, fill: hexDarken(m.memberColor, 0.52), isOverBudget: false });
        // Placeholder for 0-spent 0-budget member
        if (parts.length === 0) {
          parts.push({ fraction: 1 / Math.max(members.length, 1) * 0.3, fill: hexDarken(m.memberColor, 0.52), isOverBudget: false });
        }
        groups.push({
          groupId: m.groupId, color: m.memberColor, name: displayName,
          spentInViewer: spent, budgetInViewer: budget,
          isOverBudget: false, isVirtual: m.isVirtual, userId: m.userId,
          parts,
        });
      }
    }
  }

  // Additional Funds — only when householdBudget explicitly set and exceeds member sum
  if (householdBudget != null && householdBudget > 0 && sumMemberBudgets > 0 && householdBudget > sumMemberBudgets + 0.01) {
    const diff = householdBudget - sumMemberBudgets;
    const frac = diff / effectiveBudget;
    if (frac > 0.005) {
      groups.push({
        groupId: "additional-funds", color: ADDITIONAL_FUNDS_COLOR,
        name: t("hh.additional_funds"),
        spentInViewer: 0, budgetInViewer: diff,
        isOverBudget: false, isVirtual: false, userId: -2,
        parts: [{ fraction: frac, fill: ADDITIONAL_FUNDS_COLOR, isOverBudget: false }],
      });
    }
  }

  if (groups.length === 0) return { segs: [], groupBorders: [], legend: [], effectiveBudget, totalSpentV };

  // Normalise so total fractions never exceed 1.0
  const rawTotal = groups.reduce((s, g) => s + g.parts.reduce((ps, p) => ps + p.fraction, 0), 0);
  if (rawTotal > 1.0 + 0.001) {
    const scale = 1.0 / rawTotal;
    for (const g of groups) for (const p of g.parts) p.fraction *= scale;
  }

  const totalGapDeg = CAT_GAP * groups.length;
  const drawDeg = 360 - totalGapDeg;
  const segs: Seg[] = [];
  const groupBorders: GroupBorder[] = [];
  let cursor = 0;

  for (const g of groups) {
    const isSelected   = selectedId === g.groupId;
    const outerR       = isSelected ? RO + EXPAND : RO;
    const groupDeg     = g.parts.reduce((s, p) => s + p.fraction * drawDeg, 0);
    const groupStartDeg = cursor;
    const groupEndDeg   = cursor + groupDeg;
    const groupMidDeg   = (groupStartDeg + groupEndDeg) / 2;

    let partCursor = cursor;
    for (let pi = 0; pi < g.parts.length; pi++) {
      const p = g.parts[pi];
      const partDeg  = p.fraction * drawDeg;
      const startDeg = partCursor;
      const endDeg   = partCursor + partDeg;
      const midDeg   = (startDeg + endDeg) / 2;
      segs.push({
        id: `${g.groupId}-p${pi}`, groupId: g.groupId,
        d: arc(CX, CY, RI, outerR, startDeg, endDeg),
        fill: p.fill, isOverBudget: p.isOverBudget, midDeg,
      });
      partCursor = endDeg;
    }

    groupBorders.push({
      groupId: g.groupId, groupColor: g.color, isOverBudget: g.isOverBudget,
      d: arc(CX, CY, RI, outerR, groupStartDeg, groupEndDeg),
      midDeg: groupMidDeg, startDeg: groupStartDeg, endDeg: groupEndDeg,
    });

    cursor += groupDeg + CAT_GAP;
  }

  const legend: LegendItem[] = groups.map(g => ({
    groupId: g.groupId, color: g.color, name: g.name,
    spentInViewer: g.spentInViewer, budgetInViewer: g.budgetInViewer,
    isOverBudget: g.isOverBudget, isVirtual: g.isVirtual, userId: g.userId,
  }));

  return { segs, groupBorders, legend, effectiveBudget, totalSpentV };
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  members: HouseholdMemberInput[];
  householdBudget: number | null;   // already in viewer currency
  currency: string;
  rates: Record<string, number> | null;
  onMemberTap?: (member: HouseholdMemberInput) => void;
  iAmHead?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function HouseholdDonutChart({
  members, householdBudget, currency, rates, onMemberTap, iAmHead = false,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const idRedGlow  = `hhRedGlow-${uid}`;
  const idHintGrad = `hhHintGrad-${uid}`;
  const idHintBlur = `hhHintBlur-${uid}`;

  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [mode,           setMode]           = useState<"compact" | "expanded">("compact");
  const [containerWidth, setContainerWidth] = useState(320);
  const [hintKey,        setHintKey]        = useState(0);

  const lastCenterTapRef  = useRef<number>(0);
  const hintTimersRef     = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hintRadiiRef      = useRef<{ r1: number; r2: number }>({ r1: RI - 2, r2: RI - 2 });
  const containerRef      = useRef<HTMLDivElement>(null);
  const wiggleGroupRef    = useRef<SVGGElement>(null);
  const wiggleGroup2Ref   = useRef<SVGGElement>(null);
  const firstSegMidDegRef  = useRef<number>(0);
  const secondSegMidDegRef = useRef<number>(0);
  const hasDataRef         = useRef<boolean>(false);

  const { segs, groupBorders, legend, effectiveBudget, totalSpentV } =
    buildHouseholdChart(members, householdBudget, currency, rates, selectedId);

  const hasData = members.length > 0;
  hasDataRef.current = hasData;

  const wiggleId1 = segs[0]?.groupId ?? null;
  const _wb2 = groupBorders.length >= 2
    ? (groupBorders[3] ?? groupBorders[2] ?? groupBorders[1]) : undefined;
  firstSegMidDegRef.current  = groupBorders[0]?.midDeg ?? 0;
  secondSegMidDegRef.current = _wb2?.midDeg ?? 0;
  const wiggleId2 = _wb2?.groupId ?? null;

  const expanded = mode === "expanded";
  const selectedItem = legend.find(l => l.groupId === selectedId) ?? null;
  const budgetUsedPct = effectiveBudget > 0 && householdBudget != null
    ? Math.round((totalSpentV / effectiveBudget) * 100) : null;

  // ── Container width tracking ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries =>
      setContainerWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Hint pulse ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    const MIN_R = Math.round(0.65 * (RI - 2));
    const MAX_R = RI - 2;
    const MIN_GAP = 5;
    hintTimersRef.current = [];
    for (let i = 0; i < 3; i++) {
      hintTimersRef.current.push(setTimeout(() => {
        const r1 = MIN_R + Math.floor(Math.random() * (MAX_R - MIN_GAP - MIN_R + 1));
        const r2 = Math.min(r1 + MIN_GAP + Math.floor(Math.random() * (MAX_R - r1 - MIN_GAP + 1)), MAX_R);
        hintRadiiRef.current = { r1, r2 };
        setHintKey(k => k + 1);
      }, 3_000 + i * 5_000));
    }
    return () => hintTimersRef.current.forEach(clearTimeout);
  }, []);

  // ── Wiggle hint ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    function wiggleEl(el: SVGGElement, midDeg: number) {
      const midRad = ((midDeg - 90) * Math.PI) / 180;
      const px1 = EXPAND * 0.65 * Math.cos(midRad);
      const py1 = EXPAND * 0.65 * Math.sin(midRad);
      const px2 = EXPAND * 0.38 * Math.cos(midRad);
      const py2 = EXPAND * 0.38 * Math.sin(midRad);
      el.animate([
        { transform: "translate(0px,0px)",               easing: "cubic-bezier(0.34,1.56,0.64,1)" },
        { transform: `translate(${px1}px,${py1}px)`, offset: 0.28, easing: "cubic-bezier(0.4,0,0.2,1)" },
        { transform: "translate(0px,0px)",           offset: 0.50, easing: "cubic-bezier(0.34,1.56,0.64,1)" },
        { transform: `translate(${px2}px,${py2}px)`, offset: 0.72, easing: "cubic-bezier(0.4,0,0.2,1)" },
        { transform: "translate(0px,0px)" },
      ], { duration: 700, fill: "none" });
    }
    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = setTimeout(() => {
      if (!hasDataRef.current || !wiggleGroup2Ref.current || !checkDonutWiggleDue()) return;
      const el1 = wiggleGroupRef.current;
      const el2 = wiggleGroup2Ref.current;
      if (el1) wiggleEl(el1, firstSegMidDegRef.current);
      t2 = setTimeout(() => { if (el2) wiggleEl(el2, secondSegMidDegRef.current); }, 900);
    }, 4_000);
    return () => { clearTimeout(t1); if (t2 !== null) clearTimeout(t2); };
  }, []);

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleSegmentClick(groupId: string) {
    setSelectedId(prev => prev === groupId ? null : groupId);
  }

  function handleCenterTap() {
    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      setMode(m => m === "compact" ? "expanded" : "compact");
      setSelectedId(null);
      lastCenterTapRef.current = 0;
      hintTimersRef.current.forEach(clearTimeout);
      hintTimersRef.current = [];
      setHintKey(0);
    } else {
      lastCenterTapRef.current = now;
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        {t("hh.no_budget_set")}
      </div>
    );
  }

  // ── Segment render helpers (mirrors DonutBudgetChart exactly) ─────────────
  function fillPath(seg: Seg) {
    const isSel  = selectedId === seg.groupId;
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
        onClick={() => handleSegmentClick(seg.groupId)}
      />
    );
  }

  function partBorderPath(seg: Seg, groupColor: string, isOB: boolean) {
    const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
    const tx = EXPAND * Math.cos(midRad);
    const ty = EXPAND * Math.sin(midRad);
    return (
      <path
        key={`border-${seg.id}`}
        d={seg.d}
        fill="none"
        stroke={isOB ? "#ef4444" : groupColor + "90"}
        strokeWidth={isOB ? 1.5 : 1}
        style={{ transform: `translate(${tx}px, ${ty}px)`, transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)", pointerEvents: "none" }}
      />
    );
  }

  function groupBorderPath(gb: GroupBorder) {
    return (
      <path
        key={`border-${gb.groupId}`}
        d={gb.d}
        fill="none"
        stroke={gb.isOverBudget ? "#ef4444" : gb.groupColor + "90"}
        strokeWidth={gb.isOverBudget ? 1.5 : 1}
        style={{ transform: "translate(0px, 0px)", transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)", pointerEvents: "none" }}
      />
    );
  }

  function borderPaths(gb: GroupBorder) {
    if (selectedId !== gb.groupId) return [groupBorderPath(gb)];
    return segs.filter(s => s.groupId === gb.groupId).map(s => partBorderPath(s, gb.groupColor, gb.isOverBudget));
  }

  // Three buckets for wiggle animation refs
  const group1Fills  = segs.filter(s => s.groupId === wiggleId1).map(fillPath);
  const group1Border = groupBorders.find(gb => gb.groupId === wiggleId1);
  const group2Fills  = wiggleId2 ? segs.filter(s => s.groupId === wiggleId2).map(fillPath) : [];
  const group2Border = wiggleId2 ? groupBorders.find(gb => gb.groupId === wiggleId2) : undefined;
  const restFills    = segs.filter(s => s.groupId !== wiggleId1 && s.groupId !== wiggleId2).map(fillPath);
  const restBorders  = groupBorders.filter(gb => gb.groupId !== wiggleId1 && gb.groupId !== wiggleId2).flatMap(borderPaths);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ display: "flex", alignItems: "center", width: "100%" }}
    >
      {/* ── SVG wrapper ────────────────────────────────────────────────────── */}
      <div style={{
        width:      expanded ? containerWidth : 180,
        flexShrink: 0,
        transition: expanded ? `width ${DUR} 0.3s ${EASE}` : `width ${TRANS}`,
      }}>
        <svg
          width="100%"
          viewBox="0 0 320 320"
          style={{ overflow: "visible", display: "block" }}
          aria-label={t("hh.household_donut_label")}
        >
          <defs>
            {/* Red over-budget glow */}
            <filter id={idRedGlow} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feColorMatrix in="blur" type="matrix"
                values="1.5 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 0"
                result="redBlur" />
              <feMerge><feMergeNode in="redBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Hint pulse gradient */}
            <radialGradient id={idHintGrad} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#4b5563" />
              <stop offset="60%"  stopColor="#374151" />
              <stop offset="100%" stopColor="#1f2937" />
            </radialGradient>
            <filter id={idHintBlur} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          {/* ── Segment fills + borders ───────────────────────────────────── */}
          {wiggleId1 !== null && (
            <g ref={wiggleGroupRef}>
              {group1Fills}
              {group1Border && borderPaths(group1Border)}
            </g>
          )}
          {wiggleId2 !== null && (
            <g ref={wiggleGroup2Ref}>
              {group2Fills}
              {group2Border && borderPaths(group2Border)}
            </g>
          )}
          {restFills}
          {restBorders}

          {/* ── Hint pulse circles ────────────────────────────────────────── */}
          {mode === "compact" && hintKey > 0 && (() => {
            const idx = (hintKey - 1) % 3;
            const { r1, r2 } = hintRadiiRef.current;
            return (
              <>
                <circle cx={CX} cy={CY} r={r1}
                  fill={`url(#${idHintGrad})`} filter={`url(#${idHintBlur})`}
                  style={{ animation: `${HINT_ANIM_A[idx]} 0.224s ease 0s both`, pointerEvents: "none" }} />
                <circle cx={CX} cy={CY} r={r2}
                  fill={`url(#${idHintGrad})`} filter={`url(#${idHintBlur})`}
                  style={{ animation: `${HINT_ANIM_B[idx]} 0.224s ease 0.304s both`, pointerEvents: "none" }} />
              </>
            );
          })()}

          {/* ── Compact centre text ───────────────────────────────────────── */}
          <g style={{ opacity: expanded ? 0 : 1, transition: `opacity ${expanded ? "0.18s" : "0.28s 0.28s"} ease`, pointerEvents: "none" }}>
            {budgetUsedPct !== null ? (
              <>
                <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle" fontSize="32" fontWeight="700" fill="#ffffff">
                  {budgetUsedPct}%
                </text>
                <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="18" fill="#6b7280">
                  {t("donut.of_budget")}
                </text>
              </>
            ) : (
              <>
                <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#ffffff">
                  {fmtAmt(totalSpentV, currency)}
                </text>
                <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="#6b7280">
                  {t("hh.household_donut_label")}
                </text>
              </>
            )}
          </g>

          {/* ── Expanded centre text ──────────────────────────────────────── */}
          <g style={{ opacity: expanded ? 1 : 0, transition: `opacity ${expanded ? "0.28s 0.25s" : "0.15s"} ease`, pointerEvents: "none" }}>
            {selectedItem ? (
              <>
                {/* Tinted inner circle */}
                <circle cx={CX} cy={CY} r={RI - 4} fill={selectedItem.color + "18"} style={{ pointerEvents: "none" }} />

                {/* Avatar initial or 🏠 */}
                <text x={CX} y={CY - 36} textAnchor="middle" dominantBaseline="middle" fontSize="20">
                  {selectedItem.isVirtual ? "🏠" : selectedItem.name.charAt(0).toUpperCase()}
                </text>

                {/* Member name */}
                <text x={CX} y={CY - 14} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="600" fill="#ffffff">
                  {selectedItem.name.length > 14 ? selectedItem.name.slice(0, 13) + "…" : selectedItem.name}
                </text>

                {/* Amount spent */}
                <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="#ffffff">
                  {fmtAmt(selectedItem.spentInViewer, currency)}
                </text>

                {/* % of budget or over-budget indicator */}
                {selectedItem.budgetInViewer != null && selectedItem.budgetInViewer > 0 && (
                  <text x={CX} y={CY + 26} textAnchor="middle" dominantBaseline="middle" fontSize="11"
                    fill={selectedItem.isOverBudget ? "#f87171" : "#6b7280"}>
                    {Math.round((selectedItem.spentInViewer / selectedItem.budgetInViewer) * 100)}% {t("donut.of_its_budget")}
                  </text>
                )}

                <text x={CX} y={CY + 43} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#4b5563">
                  {t("donut.tap_to_close_line1")}
                </text>
                {t("donut.tap_to_close_line2") && (
                  <text x={CX} y={CY + 54} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#4b5563">
                    {t("donut.tap_to_close_line2")}
                  </text>
                )}
              </>
            ) : (
              <>
                {budgetUsedPct !== null ? (
                  <>
                    <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="700" fill="#ffffff">
                      {budgetUsedPct}%
                    </text>
                    <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                      {t("donut.of_budget_used")}
                    </text>
                    <text x={CX} y={CY + 30} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#374151">
                      {fmtAmt(totalSpentV, currency)} / {fmtAmt(effectiveBudget, currency)}
                    </text>
                  </>
                ) : (
                  <>
                    <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#ffffff">
                      {fmtAmt(totalSpentV, currency)}
                    </text>
                    <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                      {t("hh.household_donut_label")}
                    </text>
                  </>
                )}
                <text x={CX} y={CY + 50} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#374151">
                  {t("donut.xx_to_exit")}
                </text>
              </>
            )}
          </g>

          {/* ── Centre tap target (always on top) ────────────────────────── */}
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

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div style={{
        maxWidth:   expanded ? 0 : 220,
        marginLeft: expanded ? 0 : 12,
        opacity:    expanded ? 0 : 1,
        overflow:   "hidden",
        flexShrink: 1,
        transition: expanded ? LEGEND_EXIT_TRANS : LEGEND_ENTER_TRANS,
      }}>
        <div style={{ width: 160 }} className="space-y-2.5">
          {legend.map(item => {
            const pct    = item.budgetInViewer != null && item.budgetInViewer > 0
              ? Math.round((item.spentInViewer / item.budgetInViewer) * 100) : null;
            const isSel  = selectedId === item.groupId;
            const dimmed = selectedId !== null && !isSel;

            return (
              <button
                key={item.groupId}
                className="w-full text-left"
                style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 0.2s ease" }}
                onClick={() => handleSegmentClick(item.groupId)}
              >
                <div className="flex items-center gap-1.5">
                  {/* Avatar dot — initial char or 🏠 for virtual */}
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.isVirtual ? "🏠" : item.userId === -2 ? "" : item.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground truncate leading-tight">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 ml-6">
                  <span className="text-xs font-semibold leading-tight">
                    {fmtAmt(item.spentInViewer, currency)}
                  </span>
                  {pct !== null && (
                    <span className="text-[11px] font-medium leading-tight"
                      style={{ color: item.isOverBudget ? "#f87171" : "#6b7280" }}>
                      ({pct}%)
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* ── Manage button (head only, in compact mode) ────────────────── */}
          {iAmHead && onMemberTap && legend.filter(l => l.userId >= 0).length > 0 && (
            <div className="pt-1 border-t border-white/10">
              {legend.filter(l => l.userId >= 0).map(item => {
                const member = members.find(m => m.userId === item.userId);
                if (!member) return null;
                return (
                  <button
                    key={`manage-${item.groupId}`}
                    className="w-full text-left py-1 flex items-center gap-1.5"
                    onClick={e => { e.stopPropagation(); onMemberTap(member); }}
                  >
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black"
                      style={{ backgroundColor: item.color }}>
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[10px] text-white/40 truncate leading-tight flex-1">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-white/30">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
