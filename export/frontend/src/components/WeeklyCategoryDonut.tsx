import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, List } from "lucide-react";
import type { CategoryWeeklySpending } from "@/lib/api-client";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";

const CX = 160;
const CY = 160;
const INNER_RADIUS = 75;
const OUTER_RADIUS = 128;
const DETACH_DISTANCE = 14;
const HEADER_H = 24;
const WEEK_GAP = 2.5;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const DUR = "0.48s";
const WIDTH_TRANSITION = `${DUR} ${EASE}`;
const LEGEND_EXIT_TRANSITION = `max-width ${WIDTH_TRANSITION}, margin-left ${WIDTH_TRANSITION}, opacity 0.15s ease`;
const LEGEND_ENTER_TRANSITION = `max-width ${DUR} 0.3s ${EASE}, margin-left ${DUR} 0.3s ${EASE}, opacity 0.28s ease 0.38s`;

// Deliberately separated hues keep adjacent paid periods readable even when
// the category itself is a saturated color.
const WEEK_COLORS = ["#22d3ee", "#a78bfa", "#fbbf24", "#4ade80"];
const REMAINING_COLOR = "#374151";

type Props = {
  data: CategoryWeeklySpending;
  currency: string;
  onBack: () => void;
  onShowTransactions: () => void;
  mode?: "compact" | "expanded";
  initialMode?: "compact" | "expanded";
  onModeChange?: (mode: "compact" | "expanded") => void;
  initialContainerWidth?: number;
  contentVisible?: boolean;
  contentRevealKey?: number;
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

export type WeeklyDonutTransitionSegment = {
  d: string;
  color: string;
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

export function buildWeeklyDonutDisplayItems(data: CategoryWeeklySpending): DisplayItem[] {
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

  const drawableDegrees = Math.max(0, 360 - WEEK_GAP * rawItems.length);
  let cursor = 0;
  return rawItems.map((item): DisplayItem => {
    const sweep = totalVisualCents > 0
      ? (item.cents / totalVisualCents) * drawableDegrees
      : 0;
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
    cursor += sweep + WEEK_GAP;
    return result;
  });
}

export function buildWeeklyDonutTransitionSegments(
  data: CategoryWeeklySpending,
): WeeklyDonutTransitionSegment[] {
  // Use the same separated geometry for the settled chart and the transition
  // overlay so the color bloom does not snap between two different layouts.
  return buildWeeklyDonutDisplayItems(data).map(item => ({
      d: donutPath(item.start, item.end),
      color: item.color,
    }));
}

export default function WeeklyCategoryDonut({
  data,
  currency,
  onBack,
  onShowTransactions,
  mode,
  initialMode = "compact",
  onModeChange,
  initialContainerWidth,
  contentVisible = true,
  contentRevealKey = 0,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [internalMode, setInternalMode] = useState<"compact" | "expanded">(initialMode);
  const [containerWidth, setContainerWidth] = useState(initialContainerWidth ?? 320);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCenterTapRef = useRef(0);
  const skipExpandTransitionRef = useRef(true);
  const expanded = (mode ?? internalMode) === "expanded";

  const displayItems = useMemo(() => buildWeeklyDonutDisplayItems(data), [data]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const width = Math.round(element.getBoundingClientRect().width);
    if (width > 0) {
      setContainerWidth(width);
      skipExpandTransitionRef.current = false;
    }
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const width = Math.round(element.getBoundingClientRect().width);
      if (width > 0) setContainerWidth(width);
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const selectedItem = displayItems.find(item => item.key === selectedKey) ?? null;
  const totalPercentage = data.budget > 0 ? (data.totalSpent / data.budget) * 100 : 0;

  function handleSegmentClick(key: string) {
    setSelectedKey(previous => previous === key ? null : key);
  }

  function handleCenterTap() {
    const now = Date.now();
    if (now - lastCenterTapRef.current < 350) {
      const nextMode = expanded ? "compact" : "expanded";
      setInternalMode(nextMode);
      onModeChange?.(nextMode);
      setSelectedKey(null);
      lastCenterTapRef.current = 0;
    } else {
      lastCenterTapRef.current = now;
    }
  }

  const centerPercentage = expanded && selectedItem
    ? selectedItem.percentage
    : totalPercentage;
  const centerSpent = expanded && selectedItem
    ? selectedItem.amount
    : data.totalSpent;

  return (
    <div
      ref={containerRef}
      className="donut-chart-no-selection"
      onContextMenu={event => event.preventDefault()}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        // The dashboard overlays this view with the monthly chart field. Fill
        // that field so the legend determines the shared bottom edge instead
        // of leaving the action button directly under the donut.
        height: "100%",
      }}
    >
      {/* Keep this row the same height as Dashboard's invisible spacer so the
          donut remains fixed while the dashboard layer cross-fades into this
          view. */}
      <div
        className="flex items-center justify-between gap-3"
        style={{ height: HEADER_H, flexShrink: 0 }}
      >
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
            transition: skipExpandTransitionRef.current
              ? "none"
              : expanded
                ? `width ${DUR} 0.3s ${EASE}`
                : WIDTH_TRANSITION,
          }}
        >
          <svg
            width="100%"
            viewBox="0 0 320 320"
            style={{ overflow: "visible", display: "block" }}
            aria-label={t("weekly.chart_label")}
          >
            {displayItems.map(item => {
              const isSelected = selectedKey === item.key;
              const midpoint = (item.start + item.end) / 2;
              const radians = ((midpoint - 90) * Math.PI) / 180;
              const outerRadius = isSelected
                ? OUTER_RADIUS + DETACH_DISTANCE
                : OUTER_RADIUS;
              const path = donutPath(item.start, item.end, outerRadius);
              const detachX = DETACH_DISTANCE * Math.cos(radians);
              const detachY = DETACH_DISTANCE * Math.sin(radians);
              const detachTransform = isSelected
                ? `translate(${detachX}px, ${detachY}px)`
                : "translate(0px, 0px)";
              const isOverBudget = data.totalSpent > data.budget && !item.isRemaining;
              const borderColor = isOverBudget ? "#ff3333" : `${item.color}90`;
              return (
                <g key={item.key}>
                  <path
                    d={path}
                    fill={item.color}
                    stroke="none"
                    style={{
                      transform: detachTransform,
                      cursor: "pointer",
                      transition: "d 0.22s cubic-bezier(0.34,1.56,0.64,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                    role="button"
                    aria-label={item.label}
                    onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
                    onClick={() => handleSegmentClick(item.key)}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={borderColor}
                    strokeWidth={isOverBudget ? 3 : 1}
                    strokeLinejoin="round"
                    style={{
                      transform: detachTransform,
                      pointerEvents: "none",
                      transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease",
                    }}
                  />
                  {/* Extra stroke target keeps short periods easy to tap on mobile. */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    pointerEvents="stroke"
                    style={{
                      transform: detachTransform,
                      cursor: "pointer",
                      transition: "d 0.22s cubic-bezier(0.34,1.56,0.64,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                    aria-hidden="true"
                    onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
                    onClick={() => handleSegmentClick(item.key)}
                  />
                </g>
              );
            })}

            <g
              style={{
                opacity: !contentVisible || expanded ? 0 : 1,
                transition: !contentVisible
                  ? "opacity 0.18s ease"
                  : "opacity 0.28s 0.28s ease",
                pointerEvents: "none",
              }}
            >
              <text
                x={CX}
                y={CY - 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="32"
                fontWeight="700"
                fill="#fff"
              >
                {percentLabel(totalPercentage)}
              </text>
              <text
                x={CX}
                y={CY + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="18"
                fill="#6b7280"
              >
                {t("donut.of_budget")}
              </text>
            </g>

            <g
              style={{
                opacity: contentVisible && expanded ? 1 : 0,
                transition: contentVisible && expanded
                  ? "opacity 0.28s 0.25s ease"
                  : "opacity 0.15s ease",
                pointerEvents: "none",
              }}
            >
              <text
                x={CX}
                y={CY - 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="28"
                fontWeight="700"
                fill="#fff"
              >
                {percentLabel(centerPercentage)}
              </text>
              <text
                x={CX}
                y={CY + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {t("donut.of_budget_used")}
              </text>
              <text
                x={CX}
                y={CY + 32}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fill="#374151"
              >
                {fmtAmt(centerSpent, currency)} / {fmtAmt(data.budget, currency)}
              </text>
              <text
                x={CX}
                y={CY + 50}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="8"
                fill="#374151"
              >
                {t("donut.xx_to_exit")}
              </text>
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
            opacity: expanded || !contentVisible ? 0 : 1,
            overflow: "hidden",
            flexShrink: 1,
            pointerEvents: expanded ? "none" : "auto",
            transition: !contentVisible
              ? "opacity 0.18s ease"
              : expanded
                ? LEGEND_EXIT_TRANSITION
                : LEGEND_ENTER_TRANSITION,
          }}
        >
          <div style={{ width: 160 }} className="space-y-2.5">
            <p className="text-sm font-semibold truncate">{data.categoryName}</p>
            {displayItems.map((item, index) => {
              const isSelected = selectedKey === item.key;
              const dimmed = selectedKey !== null && !isSelected;
              return (
                <div
                  key={`${item.key}-${contentRevealKey}`}
                  style={{
                    animation: "donutLegendItem 0.22s cubic-bezier(0.4, 0, 0.2, 1) both",
                    animationDelay: `${0.48 + index * 0.07}s`,
                  }}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    style={{
                      opacity: dimmed ? 0.25 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                    onClick={() => handleSegmentClick(item.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-muted-foreground truncate leading-tight">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 ml-4">
                      <span className="text-xs font-semibold leading-tight">
                        {fmtAmt(item.amount, currency)}
                      </span>
                      <span
                        className="text-[11px] font-medium leading-tight"
                        style={{ color: "#6b7280" }}
                      >
                        ({Math.round(item.percentage)}%)
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onShowTransactions}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"
        style={{ marginTop: "auto", flexShrink: 0 }}
      >
        <List className="w-4 h-4" />
        {t("weekly.show_transactions")}
      </button>
    </div>
  );
}