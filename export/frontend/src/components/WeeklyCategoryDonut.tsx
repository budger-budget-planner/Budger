import { useMemo, useState } from "react";
import { ArrowLeft, List } from "lucide-react";
import type { CategoryWeeklySpending } from "@/lib/api-client";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";

const CX = 160;
const CY = 160;
const INNER_RADIUS = 76;
const OUTER_RADIUS = 128;
const EXPAND = 14;
const HEADER_H = 24;

// Deliberately separated hues keep adjacent paid periods readable even when
// the category itself is a saturated color.
const WEEK_COLORS = ["#22d3ee", "#a78bfa", "#fbbf24", "#4ade80"];
const REMAINING_COLOR = "#374151";

type Props = {
  data: CategoryWeeklySpending;
  currency: string;
  onBack: () => void;
  onShowTransactions: () => void;
  expanded?: boolean;
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
}

export function buildWeeklyDonutTransitionSegments(
  data: CategoryWeeklySpending,
): WeeklyDonutTransitionSegment[] {
  const displayItems = buildWeeklyDonutDisplayItems(data);
  const transitionGap = 2.5;
  const drawableDegrees = Math.max(0, 360 - transitionGap * displayItems.length);
  let cursor = 0;

  // The settled weekly chart can be contiguous, but the transition must show
  // the same separated "snap" stage as HouseholdDonutChart. Without these
  // gaps, the muted weekly paths are indistinguishable from the preceding
  // dark full-circle arc.
  return displayItems.map(item => {
    const sweep = ((item.end - item.start) / 360) * drawableDegrees;
    const segment = {
      d: donutPath(cursor, cursor + sweep),
      color: item.color,
    };
    cursor += sweep + transitionGap;
    return segment;
  });
}

export default function WeeklyCategoryDonut({ data, currency, onBack, onShowTransactions, expanded = false }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const displayItems = useMemo(() => buildWeeklyDonutDisplayItems(data), [data]);

  const selectedItem = displayItems.find(item => item.key === selectedKey) ?? null;
  const totalPercentage = data.budget > 0 ? (data.totalSpent / data.budget) * 100 : 0;
  const selectedMidpoint = selectedItem ? (selectedItem.start + selectedItem.end) / 2 : 0;
  const selectedRadians = ((selectedMidpoint - 90) * Math.PI) / 180;
  const selectedTranslate = selectedItem
    ? `translate(${EXPAND * Math.cos(selectedRadians)}px, ${EXPAND * Math.sin(selectedRadians)}px)`
    : "translate(0px, 0px)";

  function handleSegmentClick(key: string) {
    setSelectedKey(previous => previous === key ? null : key);
  }

  const centerPercentage = selectedItem?.percentage ?? totalPercentage;

  return (
    <div
      className="donut-chart-no-selection"
      onContextMenu={event => event.preventDefault()}
      style={{ display: "flex", flexDirection: "column", width: "100%" }}
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
            width: expanded ? "100%" : 180,
            flexShrink: 0,
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
              return (
                <g
                  key={item.key}
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

            <g style={{ pointerEvents: "none" }}>
              <text x={CX} y={CY - 9} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="700" fill="#fff">
                {percentLabel(centerPercentage)}
              </text>
              <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6b7280">
                {t("donut.of_budget_used")}
              </text>
            </g>
          </svg>
        </div>

        <div
          style={{
            maxWidth: 220,
            marginLeft: 12,
            overflow: "hidden",
            flexShrink: 1,
          }}
        >
          <div style={{ width: 160 }} className="space-y-2.5">
            <p className="text-sm font-semibold truncate">{data.categoryName}</p>
            {displayItems.map((item, index) => {
              const isSelected = selectedKey === item.key;
              const dimmed = selectedKey !== null && !isSelected;
              return (
                <button
                  key={item.key}
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