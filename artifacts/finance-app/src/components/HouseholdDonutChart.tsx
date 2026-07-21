import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtAmt, checkDonutWiggleDue, loadPrefs } from "@/lib/prefs";
import { convertAmount } from "@/lib/rates";
import { t } from "@/lib/i18n";
import { useGetMemberSpending } from "@/lib/api-client";
import DonutBudgetChart, { type SpendingItem } from "@/components/DonutBudgetChart";

// ─── Hint keyframes (reuse the ones DonutBudgetChart injects) ─────────────────
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

// ─── Lock keyframes ───────────────────────────────────────────────────────────
const LOCK_KF_ID = "donut-lock-kf";
if (typeof document !== "undefined" && !document.getElementById(LOCK_KF_ID)) {
  const s = document.createElement("style");
  s.id = LOCK_KF_ID;
  s.textContent = `
    @keyframes donutPadlockPop {
      0%   { opacity: 0; transform: scale(0); }
      60%  { opacity: 1; transform: scale(1.25); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes donutPadlockFade {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
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

// ─── Arc math ─────────────────────────────────────────────────────────────────
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
function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

// ─── Types ────────────────────────────────────────────────────────────────────
type Seg = { id: string; groupId: string; d: string; fill: string; isOverBudget: boolean; midDeg: number };
type GroupBorder = {
  groupId: string; d: string; groupColor: string; isOverBudget: boolean;
  midDeg: number; startDeg: number; endDeg: number;
};
type LegendItem = {
  groupId: string; color: string; name: string; spentInViewer: number;
  budgetInViewer: number | null; isOverBudget: boolean; isVirtual: boolean; userId: number;
};

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

type DrillPhase = "idle" | "fade-others" | "expand-arc" | "personal" | "collapse-arc" | "restore-others";

// ─── Chart builder ────────────────────────────────────────────────────────────
function buildHouseholdChart(
  members: HouseholdMemberInput[],
  householdBudget: number | null,
  viewerCurrency: string,
  rates: Record<string, number> | null,
  selectedId: string | null,
): { segs: Seg[]; groupBorders: GroupBorder[]; legend: LegendItem[]; effectiveBudget: number; totalSpentV: number } {

  function toViewer(amount: number, cur: string): number {
    if (!rates || cur === viewerCurrency) return amount;
    return convertAmount(amount, cur, viewerCurrency, rates);
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
      const frac = m.spentV > 0.001
        ? Math.min(m.spentV / effectiveBudget, 1)
        : 1 / Math.max(members.length, 1) * 0.5;
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

  // Additional Funds
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
      segs.push({
        id: `${g.groupId}-p${pi}`, groupId: g.groupId,
        d: arc(CX, CY, RI, outerR, startDeg, endDeg),
        fill: p.fill, isOverBudget: p.isOverBudget, midDeg: (startDeg + endDeg) / 2,
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
  householdBudget: number | null;
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

  // ── Phase 1 state ───────────────────────────────────────────────────────────
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [mode,           setMode]           = useState<"compact" | "expanded">(() => {
    try { return (localStorage.getItem("hh-donut-mode") as "compact" | "expanded") ?? "compact"; }
    catch { return "compact"; }
  });
  const [containerWidth, setContainerWidth] = useState(320);

  // Persist mode to localStorage and update state — used by both household
  // centre-tap and personal DonutBudgetChart's onModeChange callback so any
  // mode change from either view is remembered and applied to both.
  function persistMode(next: "compact" | "expanded") {
    setMode(next);
    try { localStorage.setItem("hh-donut-mode", next); } catch { /* ignore */ }
  }
  const [hintKey,        setHintKey]        = useState(0);

  // ── Phase 2 state ───────────────────────────────────────────────────────────
  const [drillPhase,      setDrillPhase]      = useState<DrillPhase>("idle");
  const [drilledMemberId, setDrilledMemberId] = useState<number | null>(null);
  const [isPrivate,       setIsPrivate]       = useState(false);
  const [lockPhase,       setLockPhase]       = useState<"pop" | "fading" | "text" | null>(null);
  const [lockPulseKey,    setLockPulseKey]    = useState(0);
  // Expanding-arc animation: driven by rAF, stored in state to trigger renders
  const [arcAnim, setArcAnim] = useState<{ d: string; color: string } | null>(null);
  // Cross-dissolve opacities
  const [hhOpacity,   setHhOpacity]   = useState(1);
  const [persOpacity, setPersOpacity] = useState(0);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const lastCenterTapRef   = useRef<number>(0);
  const longPressTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const drillTimersRef     = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lockTimersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hintRadiiRef       = useRef<{ r1: number; r2: number }>({ r1: RI - 2, r2: RI - 2 });
  const containerRef       = useRef<HTMLDivElement>(null);
  const wiggleGroupRef     = useRef<SVGGElement>(null);
  const wiggleGroup2Ref    = useRef<SVGGElement>(null);
  const firstSegMidDegRef  = useRef<number>(0);
  const secondSegMidDegRef = useRef<number>(0);
  const hasDataRef         = useRef<boolean>(false);
  const rafRef             = useRef<number | null>(null);
  const drilledGroupRef    = useRef<GroupBorder | null>(null);

  // ── Derived chart data ──────────────────────────────────────────────────────
  const { segs, groupBorders, legend, effectiveBudget, totalSpentV } =
    buildHouseholdChart(members, householdBudget, currency, rates, selectedId);

  const hasData = members.length > 0;
  hasDataRef.current = hasData;

  const wiggleId1 = segs[0]?.groupId ?? null;
  const _wb2      = groupBorders.length >= 2
    ? (groupBorders[3] ?? groupBorders[2] ?? groupBorders[1]) : undefined;
  firstSegMidDegRef.current  = groupBorders[0]?.midDeg ?? 0;
  secondSegMidDegRef.current = _wb2?.midDeg ?? 0;
  const wiggleId2 = _wb2?.groupId ?? null;

  const expanded    = mode === "expanded";
  const selectedItem = legend.find(l => l.groupId === selectedId) ?? null;
  const budgetUsedPct = effectiveBudget > 0 && householdBudget != null
    ? Math.round((totalSpentV / effectiveBudget) * 100) : null;

  // ── Data fetching for drill-down ────────────────────────────────────────────
  const isVirtualDrill = drilledMemberId === -1;
  const realMemberId   = (!isVirtualDrill && drilledMemberId != null && drilledMemberId > 0)
    ? drilledMemberId : 0;

  const {
    data: memberSpendRaw,
    isLoading: memberSpendLoading,
    isError: memberSpendError,
  } = useGetMemberSpending(realMemberId, {
    query: { enabled: drillPhase !== "idle" && !isVirtualDrill && realMemberId > 0 },
  });

  const { data: virtualSpendRaw, isLoading: virtualSpendLoading } = useQuery<any[]>({
    queryKey: ["household-spendings-spending-donut"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/households/members/household-spendings/spending`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: drillPhase !== "idle" && isVirtualDrill,
  });

  const personalLoading = isVirtualDrill ? virtualSpendLoading : memberSpendLoading;

  const drilledMember = useMemo(
    () => members.find(m => m.userId === drilledMemberId) ?? null,
    [members, drilledMemberId],
  );

  // Convert member spending to viewer currency
  const personalSpending = useMemo<SpendingItem[]>(() => {
    const raw = (isVirtualDrill ? virtualSpendRaw : memberSpendRaw) ?? [];
    const mc = drilledMember?.currency ?? currency;
    return raw.map((row: any) => ({
      categoryId:         row.categoryId        ?? null,
      categoryName:       row.categoryName      ?? null,
      total:              rates && mc !== currency ? convertAmount(row.total ?? 0, mc, currency, rates) : (row.total ?? 0),
      budget:             row.budget != null
        ? (rates && mc !== currency ? convertAmount(row.budget, mc, currency, rates) : row.budget)
        : null,
      categoryColor:      row.categoryColor     ?? null,
      count:              row.count             ?? 0,
      _catKey:            row._catKey,
      isRecurringApplied: row.isRecurringApplied,
      isLarderDesignated: row.isLarderDesignated,
    }));
  }, [memberSpendRaw, virtualSpendRaw, drilledMember, rates, currency, isVirtualDrill]);

  const personalTotalBudget = useMemo(() => {
    if (!drilledMember || drilledMember.totalBudget == null) return 0;
    const mc = drilledMember.currency;
    if (!rates || mc === currency) return drilledMember.totalBudget;
    return convertAmount(drilledMember.totalBudget, mc, currency, rates);
  }, [drilledMember, rates, currency]);

  // ── Detect private dashboard ────────────────────────────────────────────────
  useEffect(() => {
    if (memberSpendError && drillPhase !== "idle") setIsPrivate(true);
  }, [memberSpendError, drillPhase]);

  // ── Lock animation sequence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isPrivate || drillPhase !== "personal") return;
    lockTimersRef.current.forEach(clearTimeout);
    lockTimersRef.current = [];
    setLockPhase("pop");
    setLockPulseKey(0);
    const t1 = setTimeout(() => setLockPulseKey(1), 800);
    const t2 = setTimeout(() => setLockPulseKey(2), 1200);
    const t3 = setTimeout(() => setLockPhase("fading"), 2000);
    const t4 = setTimeout(() => setLockPhase("text"), 2500);
    lockTimersRef.current = [t1, t2, t3, t4];
    return () => lockTimersRef.current.forEach(clearTimeout);
  }, [isPrivate, drillPhase]);

  // ── Container width tracking ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries =>
      setContainerWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Hint pulse ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    const MIN_R = Math.round(0.65 * (RI - 2)), MAX_R = RI - 2, MIN_GAP = 5;
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

  // ── Wiggle hint ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    function wiggleEl(el: SVGGElement, midDeg: number) {
      const midRad = ((midDeg - 90) * Math.PI) / 180;
      const px1 = EXPAND * 0.65 * Math.cos(midRad), py1 = EXPAND * 0.65 * Math.sin(midRad);
      const px2 = EXPAND * 0.38 * Math.cos(midRad), py2 = EXPAND * 0.38 * Math.sin(midRad);
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
      if (wiggleGroupRef.current)  wiggleEl(wiggleGroupRef.current,  firstSegMidDegRef.current);
      t2 = setTimeout(() => { if (wiggleGroup2Ref.current) wiggleEl(wiggleGroup2Ref.current, secondSegMidDegRef.current); }, 900);
    }, 4_000);
    return () => { clearTimeout(t1); if (t2 !== null) clearTimeout(t2); };
  }, []);

  // ── rAF arc expansion ───────────────────────────────────────────────────────
  function cancelRaf() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }

  function animateArc(
    startDeg: number, endDeg: number, color: string,
    reverse: boolean,
    onComplete: () => void,
  ) {
    cancelRaf();
    const duration = 500;
    const startTime = performance.now();
    function step(now: number) {
      const rawT = Math.min((now - startTime) / duration, 1);
      const t = reverse ? 1 - easeInOut(rawT) : easeInOut(rawT);
      const curStart = startDeg * (1 - t);
      const curEnd   = endDeg + (360 - endDeg) * t;
      // Use RO (not RO + EXPAND) so the transition arc is 1:1 with both
      // the household donut and the personal donut's regular ring size.
      setArcAnim({ d: arc(CX, CY, RI, RO, curStart, curEnd), color });
      if (rawT < 1) rafRef.current = requestAnimationFrame(step);
      else onComplete();
    }
    rafRef.current = requestAnimationFrame(step);
  }

  function clearDrillTimers() { drillTimersRef.current.forEach(clearTimeout); drillTimersRef.current = []; }

  // ── Drill-down ──────────────────────────────────────────────────────────────
  function startDrillDown(groupId: string) {
    const gb = groupBorders.find(g => g.groupId === groupId);
    if (!gb) return;
    drilledGroupRef.current = gb;
    const mid = parseInt(groupId.replace("member-", ""), 10);
    setDrilledMemberId(mid);
    setIsPrivate(false);
    setLockPhase(null);
    setLockPulseKey(0);

    if (loadPrefs().disableAnimations) {
      setDrillPhase("personal");
      setHhOpacity(0);
      setPersOpacity(1);
      return;
    }

    clearDrillTimers();
    // Step A: fade-others (350 ms)
    setDrillPhase("fade-others");

    const t1 = setTimeout(() => {
      // Step B: expand-arc (500 ms)
      setDrillPhase("expand-arc");
      animateArc(gb.startDeg, gb.endDeg, gb.groupColor, false, () => {
        // Step C: cross-dissolve (300 ms)
        setHhOpacity(0);
        setPersOpacity(1);
        const t2 = setTimeout(() => {
          setDrillPhase("personal");
          setArcAnim(null);
        }, 300);
        drillTimersRef.current.push(t2);
      });
    }, 350);
    drillTimersRef.current.push(t1);
  }

  // ── Drill-back ──────────────────────────────────────────────────────────────
  function startDrillBack() {
    if (drillPhase !== "personal") return;
    lockTimersRef.current.forEach(clearTimeout); lockTimersRef.current = [];

    if (loadPrefs().disableAnimations) {
      setDrillPhase("idle");
      setDrilledMemberId(null);
      setHhOpacity(1);
      setPersOpacity(0);
      setArcAnim(null);
      return;
    }

    const gb = drilledGroupRef.current;
    if (!gb) { setDrillPhase("idle"); setDrilledMemberId(null); return; }

    clearDrillTimers();
    // Step D: dissolve-back (300 ms)
    setDrillPhase("collapse-arc");
    setPersOpacity(0);
    setHhOpacity(1);
    // Start with full ring at target position — use RO (not RO + EXPAND) to
    // match the actual donut ring size 1:1 in both directions.
    setArcAnim({ d: arc(CX, CY, RI, RO, 0, 360), color: gb.groupColor });

    const t1 = setTimeout(() => {
      // Step E: contract-arc (500 ms)
      animateArc(gb.startDeg, gb.endDeg, gb.groupColor, true, () => {
        // Step F: restore-others (350 ms)
        setDrillPhase("restore-others");
        setArcAnim(null);
        const t2 = setTimeout(() => {
          setDrillPhase("idle");
          setDrilledMemberId(null);
        }, 350);
        drillTimersRef.current.push(t2);
      });
    }, 300);
    drillTimersRef.current.push(t1);
  }

  // ── Long-press helpers ──────────────────────────────────────────────────────
  function startLongPress(groupId: string) {
    if (drillPhase !== "idle") return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      startDrillDown(groupId);
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // ── Segment click (simple toggle; drill-down via tap-and-hold) ──────────────
  function handleSegmentClick(groupId: string) {
    if (drillPhase !== "idle") return;
    setSelectedId(prev => prev === groupId ? null : groupId);
  }

  // ── Centre tap ──────────────────────────────────────────────────────────────
  function handleCenterTap() {
    if (drillPhase === "personal") { startDrillBack(); return; }
    if (drillPhase !== "idle") return;

    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      // Double-tap center → toggle compact/expanded and persist
      persistMode(mode === "compact" ? "expanded" : "compact");
      hintTimersRef.current.forEach(clearTimeout);
      setHintKey(0);
      lastCenterTapRef.current = 0;
    } else {
      lastCenterTapRef.current = now;
    }
  }

  // ── Group opacity during drill phases ───────────────────────────────────────
  function groupOpacity(groupId: string): number {
    if (drillPhase === "idle" || drillPhase === "restore-others") return 1;
    const isDrilled = groupId === (`member-${drilledMemberId}`);
    if (drillPhase === "fade-others") return isDrilled ? 1 : 0;
    // expand-arc, personal, collapse-arc: all original groups hidden (arc drawn separately)
    return 0;
  }
  function groupTransition(groupId: string): string {
    const isDrilled = groupId === (`member-${drilledMemberId}`);
    if (drillPhase === "fade-others")    return isDrilled ? "opacity 0.1s ease" : "opacity 0.35s ease";
    if (drillPhase === "restore-others") return "opacity 0.35s ease";
    return "opacity 0.15s ease";
  }

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelRaf();
    clearDrillTimers();
    lockTimersRef.current.forEach(clearTimeout);
    hintTimersRef.current.forEach(clearTimeout);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  // ─── Empty state ─────────────────────────────────────────────────────────────
  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        {t("hh.no_budget_set")}
      </div>
    );
  }

  // ─── Border helper ───────────────────────────────────────────────────────────
  function borderPath(seg: Seg, groupColor: string, isOB: boolean) {
    const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
    const tx = EXPAND * Math.cos(midRad), ty = EXPAND * Math.sin(midRad);
    return (
      <path key={`b-${seg.id}`} d={seg.d} fill="none"
        stroke={isOB ? "#ef4444" : groupColor + "90"} strokeWidth={isOB ? 1.5 : 1}
        style={{ transform: `translate(${tx}px,${ty}px)`, transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)", pointerEvents: "none" }} />
    );
  }

  const inDrill = drillPhase !== "idle";
  const showPersonal = drillPhase === "personal" || drillPhase === "collapse-arc";

  // Header row height — reserved in BOTH layers so the donut sits at the
  // identical Y position whether the household or personal overlay is showing.
  const HEADER_H = 24;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="select-none" style={{ position: "relative", width: "100%" }}>
      {/* ── Grid stacking: household and personal share one cell so the card
          height = max(household height, personal height) with no clipping.
          Absolute-overlay approach clipped the personal legend when it was
          taller than the household donut. ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>

      {/* ══ Household SVG + Legend ══════════════════════════════════════════ */}
      <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", width: "100%", opacity: hhOpacity, transition: "opacity 0.3s ease", pointerEvents: hhOpacity < 0.5 ? "none" : "auto" }}>
        {/* Invisible spacer — reserves same height as the personal overlay's header
            row so the donut appears at the exact same Y in both views. */}
        <div style={{ height: HEADER_H, flexShrink: 0 }} />
        {/* SVG + legend row */}
        <div style={{ display: "flex", alignItems: "center" }}>
        {/* SVG wrapper — compact: 180px, expanded: full width.
            Same timing as DonutBudgetChart: expand delayed 0.3 s (legend exits first),
            collapse immediate (mirror of expand). */}
        <div style={{
          width:      expanded ? containerWidth : 180,
          flexShrink: 0,
          transition: inDrill ? "none" : (expanded ? `width ${DUR} 0.3s ${EASE}` : `width ${TRANS}`),
        }}>
          <svg width="100%" viewBox="0 0 320 320" style={{ overflow: "visible", display: "block" }}
            aria-label={t("hh.household_donut_label")}>
            <defs>
              <filter id={idRedGlow} x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                <feColorMatrix in="blur" type="matrix"
                  values="1.5 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 0" result="redBlur" />
                <feMerge><feMergeNode in="redBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id={idHintGrad} cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#4b5563" />
                <stop offset="60%"  stopColor="#374151" />
                <stop offset="100%" stopColor="#1f2937" />
              </radialGradient>
              <filter id={idHintBlur} x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            {/* ── Segment groups (per-group <g> for opacity control) ── */}
            {groupBorders.map((gb, gi) => {
              const groupSegs = segs.filter(s => s.groupId === gb.groupId);
              const isW1 = gb.groupId === wiggleId1;
              const isW2 = gb.groupId === wiggleId2;
              const isSelected = selectedId === gb.groupId;

              return (
                <g
                  key={gb.groupId}
                  ref={isW1 ? wiggleGroupRef : isW2 ? wiggleGroup2Ref : undefined}
                  style={{ opacity: groupOpacity(gb.groupId), transition: groupTransition(gb.groupId) }}
                >
                  {groupSegs.map(seg => {
                    const isSel  = selectedId === seg.groupId;
                    const midRad = ((seg.midDeg - 90) * Math.PI) / 180;
                    const tx = isSel ? EXPAND * Math.cos(midRad) : 0;
                    const ty = isSel ? EXPAND * Math.sin(midRad) : 0;
                    return (
                      <path key={seg.id} d={seg.d} fill={seg.fill} stroke="none"
                        style={{
                          transform: `translate(${tx}px,${ty}px)`,
                          transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                          filter: seg.isOverBudget ? `url(#${idRedGlow})` : "none",
                          cursor: "pointer",
                        }}
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); startLongPress(seg.groupId); }}
                        onPointerUp={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onClick={() => handleSegmentClick(seg.groupId)} />
                    );
                  })}
                  {/* Borders: expanded when selected */}
                  {isSelected
                    ? groupSegs.map(s => borderPath(s, gb.groupColor, gb.isOverBudget))
                    : <path key={`b-${gb.groupId}`} d={gb.d} fill="none"
                        stroke={gb.isOverBudget ? "#ef4444" : gb.groupColor + "90"}
                        strokeWidth={gb.isOverBudget ? 1.5 : 1}
                        style={{ pointerEvents: "none" }} />
                  }
                </g>
              );
            })}

            {/* ── Expanding/contracting arc overlay (Steps B & E) ── */}
            {arcAnim && (
              <path d={arcAnim.d} fill={arcAnim.color} stroke="none" style={{ pointerEvents: "none" }} />
            )}

            {/* ── Hint pulse circles (compact mode only) ── */}
            {mode === "compact" && hintKey > 0 && !inDrill && (() => {
              const idx = (hintKey - 1) % 3;
              const { r1, r2 } = hintRadiiRef.current;
              return (
                <>
                  <circle cx={CX} cy={CY} r={r1} fill={`url(#${idHintGrad})`} filter={`url(#${idHintBlur})`}
                    style={{ animation: `${HINT_ANIM_A[idx]} 0.224s ease 0s both`, pointerEvents: "none" }} />
                  <circle cx={CX} cy={CY} r={r2} fill={`url(#${idHintGrad})`} filter={`url(#${idHintBlur})`}
                    style={{ animation: `${HINT_ANIM_B[idx]} 0.224s ease 0.304s both`, pointerEvents: "none" }} />
                </>
              );
            })()}

            {/* ── Compact centre text ── */}
            <g style={{ opacity: expanded || inDrill ? 0 : 1, transition: `opacity ${expanded || inDrill ? "0.18s" : "0.28s 0.28s"} ease`, pointerEvents: "none" }}>
              {budgetUsedPct !== null ? (
                <>
                  <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle" fontSize="32" fontWeight="700" fill="#ffffff">{budgetUsedPct}%</text>
                  <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="18" fill="#6b7280">{t("donut.of_budget")}</text>
                </>
              ) : (
                <>
                  <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#ffffff">{fmtAmt(totalSpentV, currency)}</text>
                  <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="#6b7280">{t("hh.household_donut_label")}</text>
                </>
              )}
            </g>

            {/* ── Expanded centre text ── */}
            <g style={{ opacity: expanded && !inDrill ? 1 : 0, transition: `opacity ${expanded && !inDrill ? "0.28s 0.25s" : "0.15s"} ease`, pointerEvents: "none" }}>
              {selectedItem ? (
                <>
                  <circle cx={CX} cy={CY} r={RI - 4} fill={selectedItem.color + "18"} />
                  <text x={CX} y={CY - 36} textAnchor="middle" dominantBaseline="middle" fontSize="20">
                    {selectedItem.isVirtual ? "🏠" : selectedItem.name.charAt(0).toUpperCase()}
                  </text>
                  <text x={CX} y={CY - 14} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="600" fill="#ffffff">
                    {selectedItem.name.length > 14 ? selectedItem.name.slice(0, 13) + "…" : selectedItem.name}
                  </text>
                  <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="#ffffff">
                    {fmtAmt(selectedItem.spentInViewer, currency)}
                  </text>
                  {selectedItem.budgetInViewer != null && selectedItem.budgetInViewer > 0 && (
                    <text x={CX} y={CY + 26} textAnchor="middle" dominantBaseline="middle" fontSize="11"
                      fill={selectedItem.isOverBudget ? "#f87171" : "#6b7280"}>
                      {Math.round((selectedItem.spentInViewer / selectedItem.budgetInViewer) * 100)}% {t("donut.of_its_budget")}
                    </text>
                  )}
                  {/* Drill hint */}
                  {selectedItem.userId > 0 && (
                    <text x={CX} y={CY + 48} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#4b5563">
                      hold to view details
                    </text>
                  )}
                </>
              ) : (
                <>
                  {budgetUsedPct !== null ? (
                    <>
                      <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="700" fill="#ffffff">{budgetUsedPct}%</text>
                      <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">{t("donut.of_budget_used")}</text>
                      <text x={CX} y={CY + 30} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#374151">{fmtAmt(totalSpentV, currency)} / {fmtAmt(effectiveBudget, currency)}</text>
                    </>
                  ) : (
                    <>
                      <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#ffffff">{fmtAmt(totalSpentV, currency)}</text>
                      <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">{t("hh.household_donut_label")}</text>
                    </>
                  )}
                  <text x={CX} y={CY + 50} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#374151">{t("donut.xx_to_exit")}</text>
                </>
              )}
            </g>

            {/* ── Centre tap target ── */}
            <circle cx={CX} cy={CY} r={RI - 2} fill="transparent"
              role="button" style={{ cursor: "pointer" }} onClick={handleCenterTap} />
          </svg>
        </div>

        {/* ── Legend (right of donut in compact; hidden in expanded) ── */}
        <div style={{
          maxWidth:   expanded ? 0 : 220,
          marginLeft: expanded ? 0 : 12,
          opacity:    expanded ? 0 : 1,
          overflow:   "hidden", flexShrink: 1,
          transition: expanded ? LEGEND_EXIT_TRANS : LEGEND_ENTER_TRANS,
        }}>
          <div style={{ width: 160 }} className="space-y-2.5">
            {legend.map(item => {
              const pct    = item.budgetInViewer != null && item.budgetInViewer > 0
                ? Math.round((item.spentInViewer / item.budgetInViewer) * 100) : null;
              const isSel  = selectedId === item.groupId;
              const dimmed = selectedId !== null && !isSel;
              return (
                <button key={item.groupId} className="w-full text-left"
                  style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 0.2s ease" }}
                  onPointerDown={() => startLongPress(item.groupId)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => handleSegmentClick(item.groupId)}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black"
                      style={{ backgroundColor: item.color }}>
                      {item.isVirtual ? "🏠" : item.userId === -2 ? "" : item.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground truncate leading-tight">{item.name}</span>
                  </div>
                  <div className="flex items-baseline gap-1 ml-6">
                    <span className="text-xs font-semibold leading-tight">{fmtAmt(item.spentInViewer, currency)}</span>
                    {pct !== null && (
                      <span className="text-[11px] font-medium leading-tight"
                        style={{ color: item.isOverBudget ? "#f87171" : "#6b7280" }}>({pct}%)</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        </div>{/* ── close SVG+legend row ── */}
      </div>

      {/* ══ Personal overlay (drill-down) ═══════════════════════════════════ */}
      {showPersonal && (
        <div style={{
          gridArea: "1 / 1",
          width: "100%",
          opacity:    persOpacity,
          transition: "opacity 0.3s ease",
          pointerEvents: persOpacity < 0.1 ? "none" : "auto",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header row — fixed height matching the household spacer so the
              donut sits at identical Y position in both views. */}
          <div style={{ height: HEADER_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors"
              onClick={startDrillBack}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
              <span>{t("hh.drill_back_hint")}</span>
            </button>
            {iAmHead && onMemberTap && drilledMember && !isVirtualDrill && (
              <button
                className="px-2 py-0.5 rounded-lg bg-white/10 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/15 transition-colors"
                onClick={() => onMemberTap(drilledMember)}
              >
                {t("hh.manage")}
              </button>
            )}
          </div>

          {/* Personal donut or lock or spinner — same row layout as household */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {isPrivate ? (
              /* ─── Private dashboard lock ─── */
              <div style={{ width: expanded ? containerWidth : 180, flexShrink: 0 }}>
                <svg width="100%" viewBox="0 0 320 320" style={{ overflow: "visible", display: "block" }}>
                  <defs>
                    <filter id={`${idHintBlur}-lock`} x="-25%" y="-25%" width="150%" height="150%">
                      <feGaussianBlur stdDeviation="10" />
                    </filter>
                  </defs>
                  {/* Gray full ring */}
                  <path d={arc(CX, CY, RI, RO, 0, 359.99)} fill="#374151" />

                  {/* Amber hint pulses */}
                  {lockPulseKey > 0 && (
                    <g key={lockPulseKey}>
                      <circle cx={CX} cy={CY} r={RI - 10} fill="#f59e0b"
                        filter={`url(#${idHintBlur}-lock)`}
                        style={{ animation: `${lockPulseKey === 1 ? "donutBlink045" : "donutBlink053"} 0.224s ease 0s both` }} />
                    </g>
                  )}

                  {/* Padlock (shown until "text" phase) */}
                  {lockPhase !== "text" && lockPhase !== null && (
                    <g style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                      fill: "#9ca3af",
                      animation: lockPhase === "pop"
                        ? "donutPadlockPop 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards"
                        : "donutPadlockFade 0.4s ease forwards",
                    }}>
                      {/* Shackle */}
                      <path d={`M ${CX - 9} ${CY - 4} L ${CX - 9} ${CY - 13} A 9 9 0 0 1 ${CX + 9} ${CY - 13} L ${CX + 9} ${CY - 4}`}
                        fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" />
                      {/* Body */}
                      <rect x={CX - 13} y={CY - 4} width="26" height="20" rx="3" fill="#9ca3af" />
                      {/* Keyhole */}
                      <circle cx={CX} cy={CY + 5} r="3.5" fill="#1f2937" />
                      <rect x={CX - 1.5} y={CY + 5} width="3" height="6" rx="1.5" fill="#1f2937" />
                    </g>
                  )}

                  {/* Static text after lock fades */}
                  {lockPhase === "text" && (
                    <>
                      <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="600" fill="#ffffff">
                        {drilledMember?.name}
                      </text>
                      <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                        {t("hh.private_lock_msg")}
                      </text>
                    </>
                  )}
                </svg>
              </div>
            ) : personalLoading || personalSpending.length === 0 ? (
              /* ─── Loading spinner in centre of donut footprint ─── */
              <div style={{ width: expanded ? containerWidth : 180, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1" }}>
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              </div>
            ) : (
              /* ─── Personal DonutBudgetChart — matches household mode ─── */
              <DonutBudgetChart
                spending={personalSpending}
                totalBudget={personalTotalBudget}
                currency={currency}
                hasData={true}
                initialMode={mode}
                onModeChange={m => persistMode(m)}
                initialContainerWidth={containerWidth}
              />
            )}
          </div>
        </div>
      )}
      </div>{/* ── close grid stacking container ── */}
    </div>
  );
}
