import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, List } from "lucide-react";
import type { CategoryWeeklySpending } from "@/lib/api-client";
import { fmtAmt, loadPrefs } from "@/lib/prefs";
import { t } from "@/lib/i18n";

const CX = 160;
const CY = 160;
const INNER_RADIUS = 76;
const OUTER_RADIUS = 128;
const EXPAND = 14;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const DUR = "0.48s";
const TRANS = `${DUR} ${EASE}`;
const LEGEND_EXIT_TRANS = `max-width ${TRANS}, margin-left ${TRANS}, opacity 0.15s ease`;
const LEGEND_ENTER_TRANS = `max-width ${DUR} 0.3s ${EASE}, margin-left ${DUR} 0.3s ${EASE}, opacity 0.28s ease 0.38s`;

// Deliberately separated hues keep adjacent paid periods readable even when
// the category itself is a saturated color.
const WEEK_COLORS = ["#22d3ee", "#a78bfa", "#fbbf24", "#4ade80"];
const REMAINING_COLOR = "#374151";

const HINT_KF_ID = "weekly-donut-hint-kf";
if (typeof document !== "undefined" && !document.getElementById(HINT_KF_ID)) {
  const style = document.createElement("style");
  style.id = HINT_KF_ID;
  style.textContent = `
    @keyframes weeklyDonutBlink037 { 0% { opacity: 0; } 50% { opacity: .37; } 100% { opacity: 0; } }
    @keyframes weeklyDonutBlink045 { 0% { opacity: 0; } 50% { opacity: .45; } 100% { opacity: 0; } }
    @keyframes weeklyDonutBlink053 { 0% { opacity: 0; } 50% { opacity: .53; } 100% { opacity: 0; } }
    @keyframes weeklyDonutBlink061 { 0% { opacity: 0; } 50% { opacity: .61; } 100% { opacity: 0; } }
  `;
  document.head.appendChild(style);
}

const HINT_ANIM_A = ["weeklyDonutBlink037", "weeklyDonutBlink045", "weeklyDonutBlink053"] as const;
const HINT_ANIM_B = ["weeklyDonutBlink045", "weeklyDonutBlink053", "weeklyDonutBlink061"] as const;

type Props = {
  data: CategoryWeeklySpending;
  currency: string;
  onBack: () => void;
  onShowTransactions: () => void;
};

type DisplayItem = {
  key: string;
  label: string;
  color: string;
  amount: number;
  percentage: number;
  start: number;
  end: number;
  isRemaining: boolean;
};

function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(radians), y: CY + radius * Math.sin(radians) };
}

function donutPath(start: number, end: number, outerRadius = OUTER_RADIUS): string {
  const sweep = Math.max(0.01, Math.min(end - start, 359.99));
  const startOuter = polar(outerRadius, start);
  const endOuter = polar(outerRadius, start + sweep);
  const endInner = polar(INNER_RADIUS, start + sweep);
  const startInner = polar(INNER_RADIUS, start);
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function weekRangeLabel(startDate: string, endDate: string): string {
  const startDay = startDate.slice(8, 10);
  const endDay = endDate.slice(8, 10);
  const endMonth = endDate.slice(5, 7);
  return `${startDay}-${endDay}.${endMonth}`;
}

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

export default function WeeklyCategoryDonut({ data, currency, onBack, onShowTransactions }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"compact" | "expanded">("compact");
  const [containerWidth, setContainerWidth] = useState(320);
  const [hintKey, setHintKey] = useState(0);
  const [legendAnimKey, setLegendAnimKey] = useState(0);
  const lastCenterTapRef = useRef(0);
  const hintTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hintRadiiRef = useRef({ r1: INNER_RADIUS - 2, r2: INNER_RADIUS - 2 });
  const containerRef = useRef<HTMLDivElement>(null);
  const firstGroupRef = useRef<SVGGElement>(null);
  const secondGroupRef = useRef<SVGGElement>(null);

  const displayItems = useMemo(() => {
    const budgetCents = Math.round(data.budget * 100);
    const spentCents = data.weeks.map(week => Math.round(week.spent * 100));
    const spentTotalCents = spentCents.reduce((sum, cents) => sum + cents, 0);
    const remainingCents = Math.max(0, budgetCents - spentTotalCents);
    const totalVisualCents = remainingCents > 0
      ? budgetCents
      : Math.max(budgetCents, spentTotalCents);

    const rawItems: Array<{
      key: string;
      label: string;
      color: string;
      amount: number;
      percentage: number;
      cents: number;
      isRemaining: boolean;
    }> = [];

    data.weeks.forEach((week, index) => {
      const cents = spentCents[index];
      // Empty periods are intentionally absent from both the ring and the list.
      if (cents <= 0) return;
      rawItems.push({
        key: `week-${index}`,
        label: weekRangeLabel(week.startDate, week.endDate),
        color: WEEK_COLORS[index % WEEK_COLORS.length],
        amount: cents / 100,
        percentage: budgetCents > 0 ? (cents / budgetCents) * 100 : 0,
        cents,
        isRemaining: false,
      });
    });

    if (remainingCents > 0) {
      rawItems.push({
        key: "remaining",
        label: t("weekly.remaining"),
        color: REMAINING_COLOR,
        amount: remainingCents / 100,
        percentage: budgetCents > 0 ? (remainingCents / budgetCents) * 100 : 0,
        cents: remainingCents,
        isRemaining: true,
      });
    }

    let cursor = 0;
    return rawItems.map((item): DisplayItem => {
      const sweep = totalVisualCents > 0 ? (item.cents / totalVisualCents) * 360 : 0;
      const result = {
        key: item.key,
        label: item.label,
        color: item.color,
        amount: item.amount,
        percentage: item.percentage,
        start: cursor,
        end: cursor + sweep,
        isRemaining: item.isRemaining,
      };
      cursor += sweep;
      return result;
    });
  }, [data]);

  const expanded = mode === "expanded";
  const selectedItem = displayItems.find(item => item.key === selectedKey) ?? null;
  const totalPercentage = data.budget > 0 ? (data.totalSpent / data.budget) * 100 : 0;
  const selectedMidpoint = selectedItem ? (selectedItem.start + selectedItem.end) / 2 : 0;
  const selectedRadians = ((selectedMidpoint - 90) * Math.PI) / 180;
  const selectedTranslate = selectedItem
    ? `translate(${EXPAND * Math.cos(selectedRadians)}px, ${EXPAND * Math.sin(selectedRadians)}px)`
    : "translate(0px, 0px)";

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const width = Math.round(element.getBoundingClientRect().width);
    if (width > 0) setContainerWidth(width);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (width > 0) setContainerWidth(width);
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  // Match the compact donut's staggered hint pulses. They are intentionally
  // visual-only and never intercept taps.
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    hintTimersRef.current = [3_000, 8_000, 13_000].map((delay, index) =>
      setTimeout(() => {
        const minRadius = Math.round(0.65 * (INNER_RADIUS - 2));
        const maxRadius = INNER_RADIUS - 2;
        const r1 = minRadius + Math.floor(Math.random() * Math.max(1, maxRadius - minRadius - 4));
        const r2 = Math.min(maxRadius, r1 + 5 + Math.floor(Math.random() * Math.max(1, maxRadius - r1 - 4)));
        hintRadiiRef.current = { r1, r2 };
        setHintKey(index + 1);
      }, delay),
    );
    return () => hintTimersRef.current.forEach(clearTimeout);
  }, []);

  // Match the subtle two-beat segment wiggle used by the other dashboard donuts.
  useEffect(() => {
    if (loadPrefs().disableAnimations) return;
    const timer = setTimeout(() => {
      const wiggle = (element: SVGGElement | null, midpoint: number) => {
        if (!element) return;
        const radians = ((midpoint - 90) * Math.PI) / 180;
        const x1 = EXPAND * 0.65 * Math.cos(radians);
        const y1 = EXPAND * 0.65 * Math.sin(radians);
        const x2 = EXPAND * 0.38 * Math.cos(radians);
        const y2 = EXPAND * 0.38 * Math.sin(radians);
        element.animate([
          { transform: "translate(0px, 0px)" },
          { transform: `translate(${x1}px, ${y1}px)`, offset: 0.28 },
          { transform: "translate(0px, 0px)", offset: 0.5 },
          { transform: `translate(${x2}px, ${y2}px)`, offset: 0.72 },
          { transform: "translate(0px, 0px)" },
        ], { duration: 700, fill: "none" });
      };
      if (displayItems.length > 1) {
        wiggle(firstGroupRef.current, (displayItems[0].start + displayItems[0].end) / 2);
        setTimeout(() => wiggle(secondGroupRef.current, (displayItems[1].start + displayItems[1].end) / 2), 900);
      }
    }, 4_000);
    return () => clearTimeout(timer);
  }, [displayItems]);

  useEffect(() => {
    if (!expanded) setLegendAnimKey(key => key + 1);
  }, [expanded]);

  function handleSegmentClick(key: string) {
    setSelectedKey(previous => previous === key ? null : key);
  }

  function handleCenterTap() {
    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      const nextMode = expanded ? "compact" : "expanded";
      setMode(nextMode);
      hintTimersRef.current.forEach(clearTimeout);
      hintTimersRef.current = [];
      setHintKey(0);
      lastCenterTapRef.current = 0;
    } else {
      lastCenterTapRef.current = now;
    }
  }

  const centerPercentage = selectedItem?.percentage ?? totalPercentage;

  return (
    <div
      ref={containerRef}
      className="donut-chart-no-selection"
      onContextMenu={event => event.preventDefault()}
      style={{ display: "flex", flexDirection: "column", width: "100%" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
          {t("weekly.back")}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        <div
          style={{
            width: expanded ? containerWidth : 180,
            flexShrink: 0,
            transition: expanded ? `width ${DUR} 0.3s ${EASE}` : `width ${TRANS}`,
          }}
        >
          <svg
            width="100%"
            viewBox="0 0 320 320"
            style={{ overflow: "visible", display: "block" }}
            aria-label={t("weekly.chart_label")}
          >
            {displayItems.map((item, index) => {
              const isSelected = selectedKey === item.key;
              const groupRef = index === 0 ? firstGroupRef : index === 1 ? secondGroupRef : undefined;
              return (
                <g
                  key={item.key}
                  ref={groupRef}
                  style={{
                    transform: isSelected ? selectedTranslate : "translate(0px, 0px)",
                    transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <path
                    d={donutPath(item.start, item.end)}
                    fill={item.color}
                    stroke={data.totalSpent > data.budget && !item.isRemaining ? "#ff3333" : "none"}
                    strokeWidth={data.totalSpent > data.budget && !item.isRemaining ? 3 : 0}
                    style={{ cursor: "pointer", transition: "all 0.48s cubic-bezier(0.4, 0, 0.2, 1)" }}
                    role="button"
                    aria-label={item.label}
                    onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
                    onClick={() => handleSegmentClick(item.key)}
                  />
                  {/* Extra stroke target keeps short periods easy to tap on mobile. */}
                  <path
                    d={donutPath(item.start, item.end)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    pointerEvents="stroke"
                    style={{ cursor: "pointer" }}
                    aria-hidden="true"
                    onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
                    onClick={() => handleSegmentClick(item.key)}
                  />
                </g>
              );
            })}

            {mode === "compact" && hintKey > 0 && (() => {
              const index = (hintKey - 1) % 3;
              const { r1, r2 } = hintRadiiRef.current;
              return (
                <>
                  <circle
                    key={`weekly-hint-a-${hintKey}`}
                    cx={CX}
                    cy={CY}
                    r={r1}
                    fill="#374151"
                    style={{ animation: `${HINT_ANIM_A[index]} 0.224s ease 0s both`, pointerEvents: "none" }}
                  />
                  <circle
                    key={`weekly-hint-b-${hintKey}`}
                    cx={CX}
                    cy={CY}
                    r={r2}
                    fill="#374151"
                    style={{ animation: `${HINT_ANIM_B[index]} 0.224s ease 0.304s both`, pointerEvents: "none" }}
                  />
                </>
              );
            })()}

            <g style={{ opacity: expanded ? 0 : 1, transition: `opacity ${expanded ? "0.18s" : "0.28s 0.28s"} ease`, pointerEvents: "none" }}>
              <text x={CX} y={CY - 9} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="700" fill="#fff">
                {percentLabel(centerPercentage)}
              </text>
              <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                {t("donut.of_budget_used")}
              </text>
            </g>

            <g style={{ opacity: expanded ? 1 : 0, transition: `opacity ${expanded ? "0.28s 0.25s" : "0.15s"} ease`, pointerEvents: "none" }}>
              <circle
                cx={CX}
                cy={CY}
                r={INNER_RADIUS - 4}
                fill={selectedItem?.color ? `${selectedItem.color}18` : "transparent"}
              />
              <text x={CX} y={CY - 19} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="700" fill="#fff">
                {percentLabel(centerPercentage)}
              </text>
              <text x={CX} y={CY + 4} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                {t("donut.of_budget_used")}
              </text>
              {selectedItem && (
                <text x={CX} y={CY + 47} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#4b5563">
                  {selectedItem.label}
                </text>
              )}
              {!selectedItem && (
                <text x={CX} y={CY + 50} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#374151">
                  {t("donut.xx_to_exit")}
                </text>
              )}
            </g>

            <circle
              cx={CX}
              cy={CY}
              r={INNER_RADIUS - 2}
              fill="transparent"
              role="button"
              aria-label={expanded ? t("donut.collapse_label") : t("donut.expand_label")}
              style={{ cursor: "pointer" }}
              onClick={handleCenterTap}
            />
          </svg>
        </div>

        <div
          style={{
            maxWidth: expanded ? 0 : 220,
            marginLeft: expanded ? 0 : 12,
            opacity: expanded ? 0 : 1,
            overflow: "hidden",
            flexShrink: 1,
            transition: expanded ? LEGEND_EXIT_TRANS : LEGEND_ENTER_TRANS,
          }}
        >
          <div style={{ width: 160 }} className="space-y-2.5">
            <p className="text-sm font-semibold truncate">{data.categoryName}</p>
            {displayItems.map((item, index) => {
              const isSelected = selectedKey === item.key;
              const dimmed = selectedKey !== null && !isSelected;
              return (
                <button
                  key={`${item.key}-${legendAnimKey}`}
                  type="button"
                  className="w-full text-left"
                  style={{
                    opacity: dimmed ? 0.25 : 1,
                    transition: "opacity 0.2s ease",
                    animation: "donutLegendItem 0.22s cubic-bezier(0.4, 0, 0.2, 1) both",
                    animationDelay: `${0.48 + index * 0.07}s`,
                  }}
                  onClick={() => handleSegmentClick(item.key)}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate leading-tight">{item.label}</span>
                    </span>
                    <span className="flex-shrink-0 font-semibold">{fmtAmt(item.amount, currency)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onShowTransactions}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"
      >
        <List className="w-4 h-4" />
        {t("weekly.show_transactions")}
      </button>
    </div>
  );
}