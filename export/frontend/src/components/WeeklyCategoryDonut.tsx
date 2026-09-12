import { useMemo } from "react";
import { ArrowLeft, List } from "lucide-react";
import type { CategoryWeeklySpending } from "@/lib/api-client";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";

const CX = 160;
const CY = 160;
const INNER_RADIUS = 76;
const OUTER_RADIUS = 128;

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
  percentage: number | null;
  start: number;
  end: number;
  isRemaining?: boolean;
};

function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(radians), y: CY + radius * Math.sin(radians) };
}

function donutPath(start: number, end: number): string {
  const sweep = Math.max(0.01, Math.min(end - start, 359.99));
  const startOuter = polar(OUTER_RADIUS, start);
  const endOuter = polar(OUTER_RADIUS, start + sweep);
  const endInner = polar(INNER_RADIUS, start + sweep);
  const startInner = polar(INNER_RADIUS, start);
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return hex;
  const channels = [0, 2, 4].map(offset =>
    Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(offset, offset + 2), 16) * amount))),
  );
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function displayPercentage(amountCents: number, budgetCents: number): number {
  return Math.round((amountCents / budgetCents) * 1000) / 10;
}

export default function WeeklyCategoryDonut({ data, currency, onBack, onShowTransactions }: Props) {
  const displayItems = useMemo(() => {
    const budgetCents = Math.round(data.budget * 100);
    const spentCents = data.weeks.map(week => Math.round(week.spent * 100));
    const remainingCents = Math.max(0, budgetCents - spentCents.reduce((sum, cents) => sum + cents, 0));
    const totalVisualCents = remainingCents > 0 ? budgetCents : Math.max(budgetCents, spentCents.reduce((sum, cents) => sum + cents, 0));
    const positiveWeeks = data.weeks
      .map((week, index) => ({ week, index, cents: spentCents[index] }))
      .filter(item => item.cents > 0);
    const rawItems = [
      ...positiveWeeks.map(({ week, index, cents }) => ({
        key: `week-${index}`,
        label: `${t("weekly.week")} ${index + 1}`,
        color: shade(data.categoryColor, 1 - index * 0.12),
        amount: cents / 100,
        percentage: displayPercentage(cents, budgetCents),
        cents,
        isRemaining: false,
      })),
      ...(remainingCents > 0 ? [{
        key: "remaining",
        label: t("weekly.remaining"),
        color: "#374151",
        amount: remainingCents / 100,
        percentage: 0,
        cents: remainingCents,
        isRemaining: true,
      }] : []),
    ];

    const sumSpentPercent = rawItems
      .filter(item => !item.isRemaining)
      .reduce((sum, item) => sum + (item.percentage ?? 0), 0);
    if (remainingCents > 0) {
      const remainingIndex = rawItems.findIndex(item => item.isRemaining);
      if (remainingIndex >= 0) {
        rawItems[remainingIndex].percentage = Math.round((100 - sumSpentPercent) * 10) / 10;
      }
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

  const isOverBudget = data.totalSpent > data.budget;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          {t("weekly.back")}
        </button>
        <span className="text-xs text-muted-foreground">{data.month}</span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-[180px] flex-shrink-0">
          <svg viewBox="0 0 320 320" width="100%" aria-label={t("weekly.chart_label")}>
            {displayItems.map(item => (
              <path
                key={item.key}
                d={donutPath(item.start, item.end)}
                fill={item.color}
                stroke={isOverBudget && !item.isRemaining ? "#ff3333" : "none"}
                strokeWidth={isOverBudget && !item.isRemaining ? 3 : 0}
                style={{ transition: "all 0.48s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            ))}
            <circle cx={CX} cy={CY} r={INNER_RADIUS - 2} fill="transparent" />
            <text x={CX} y={CY - 9} textAnchor="middle" fontSize="21" fontWeight="700" fill="#fff">
              {fmtAmt(data.totalSpent, currency)}
            </text>
            <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {fmtAmt(data.budget, currency)} {t("weekly.budget")}
            </text>
          </svg>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold truncate">{data.categoryName}</p>
          {data.weeks.map((week, index) => {
            const hasSpending = week.spent > 0;
            const item = displayItems.find(candidate => candidate.key === `week-${index}`);
            return (
              <div key={index} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item?.color ?? "#374151", opacity: hasSpending ? 1 : 0.45 }} />
                  <span className="truncate">{t("weekly.week")} {index + 1} · {week.startDate.slice(8)}–{week.endDate.slice(8)}</span>
                </span>
                <span className="flex-shrink-0 font-semibold">
                  {fmtAmt(week.spent, currency)}
                  {hasSpending && !isOverBudget && <span className="ml-1 text-muted-foreground">({item?.percentage?.toFixed(1)}%)</span>}
                  {hasSpending && isOverBudget && <span className="ml-1 text-red-400">({item?.percentage?.toFixed(1)}%)</span>}
                </span>
              </div>
            );
          })}
          {!isOverBudget && displayItems.some(item => item.isRemaining) && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                {t("weekly.remaining")}
              </span>
              <span>{fmtAmt(Math.max(0, data.budget - data.totalSpent), currency)} ({displayItems.find(item => item.isRemaining)?.percentage?.toFixed(1)}%)</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onShowTransactions}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"
      >
        <List className="w-4 h-4" />
        {t("weekly.show_transactions")}
      </button>
    </div>
  );
}