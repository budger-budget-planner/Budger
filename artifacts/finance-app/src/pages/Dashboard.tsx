import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetSpendingSummary,
  useGetMonthlySummary,
  useGetGoalsSummary,
} from "@workspace/api-client-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Rectangle,
} from "recharts";
import { TrendingDown, Target, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { loadPrefs, fmtAmt, fmtAmtRound } from "@/lib/prefs";
import { t, localiseMonthStr, fmtMonthYear } from "@/lib/i18n";

const CHART_COLORS = ["#6366f1", "#34d399", "#fb923c", "#f472b6", "#38bdf8", "#a78bfa", "#fbbf24"];

function BarTooltipContent({ active, payload, label, currency }: any) {
  if (!active || !payload?.length || !payload[0]?.value) return null;
  return (
    <div style={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
      <p style={{ color: "#999", marginBottom: 2 }}>{label}</p>
      <p style={{ color: "#fff", fontWeight: 600 }}>{fmtAmt(payload[0].value, currency)}</p>
    </div>
  );
}

function BudgetBar({ spent, budget, color }: { spent: number; budget: number; color: string }) {
  const pct = Math.min((spent / budget) * 100, 100);
  return (
    <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: spent > budget ? "#f87171" : color }} />
    </div>
  );
}

export default function DashboardPage() {
  const prefs = loadPrefs();
  const [, navigate] = useLocation();
  const [viewDate, setViewDate] = useState(new Date());
  const [barTooltipY, setBarTooltipY] = useState<number | undefined>(undefined);

  const isCurrentMonth = format(viewDate, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const viewMonth      = format(viewDate, "yyyy-MM");

  const { data: spending, isLoading: spendingLoading } = useGetSpendingSummary({ month: viewMonth });
  const { data: monthly }    = useGetMonthlySummary();
  const { data: goalsSummary } = useGetGoalsSummary({ month: viewMonth });

  const totalSpending = spending?.reduce((s, c) => s + c.total, 0) ?? 0;
  const totalBudget   = prefs.totalBudget ?? 0;
  const txCount       = spending?.reduce((s, c) => s + c.count, 0) ?? 0;

  const totalGoalContributions = (goalsSummary ?? []).reduce((s, g) => s + g.contributed, 0);
  const activeGoalsWithContribs = (goalsSummary ?? []).filter(g => g.contributed > 0);

  return (
    <div className="px-4 pt-4 pb-4 max-w-3xl mx-auto">

      <div className="mb-4">
        <h1 className="text-xl font-bold">{t("dashboard.title")}</h1>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 bg-card border border-border rounded-2xl px-3 py-2">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-muted"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{fmtMonthYear(viewDate)}</p>
          {isCurrentMonth && (
            <p className="text-[10px] text-muted-foreground">{t("dashboard.this_month")}</p>
          )}
        </div>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          disabled={isCurrentMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-muted disabled:opacity-25"
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.total_spent")}</p>
          <p className="text-2xl font-bold" data-testid="text-total-spent">{fmtAmt(totalSpending, prefs.currency)}</p>
          <p className="text-xs text-muted-foreground">{t("dashboard.this_month")}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.budget")}</p>
          {totalBudget > 0 ? (
            <>
              <p className="text-2xl font-bold">{Math.round((totalSpending / totalBudget) * 100)}%</p>
              <div className="mt-1 space-y-0.5">
                <BudgetBar spent={totalSpending} budget={totalBudget} color="#818cf8" />
                <p className="text-xs text-muted-foreground">
                  {fmtAmtRound(totalSpending, prefs.currency)} {t("common.of")} {fmtAmtRound(totalBudget, prefs.currency)}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">—</p>
              <p className="text-xs text-muted-foreground">{t("dashboard.no_budgets")}</p>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.transactions")}</p>
          <p className="text-2xl font-bold">{txCount}</p>
          <p className="text-xs text-muted-foreground">{t("dashboard.this_month")}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.for_goals")}</p>
          <p className="text-2xl font-bold">{fmtAmtRound(totalGoalContributions, prefs.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {activeGoalsWithContribs.length > 0
              ? prefs.language === "pl"
                ? `${activeGoalsWithContribs.length} ${activeGoalsWithContribs.length === 1 ? "cel aktywny" : "cele aktywne"}`
                : `${activeGoalsWithContribs.length} ${activeGoalsWithContribs.length !== 1 ? "goals" : "goal"} active`
              : t("dashboard.no_contributions")}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-4 mb-5">
        {/* Spending by Category */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">{t("dashboard.by_category")}</p>
          {spendingLoading ? (
            <div className="h-44 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : spending && spending.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_.recharts-sector:focus]:outline-none">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart style={{ outline: "none" }}>
                    <Pie data={spending} dataKey="total" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={64} paddingAngle={2}
                      style={{ outline: "none" }}>
                      {spending.map((entry, i) => (
                        <Cell key={entry.categoryId ?? "unc"}
                          fill={entry.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {spending.slice(0, 6).map((item, i) => (
                  <div key={item.categoryId ?? "unc"} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground truncate">{(!item.categoryName || item.categoryName === "Uncategorized") ? t("common.uncategorized") : item.categoryName}</span>
                        {item.budget != null && item.total > item.budget && (
                          <span className="text-destructive font-medium flex-shrink-0">!</span>
                        )}
                      </div>
                      <span className="font-semibold ml-2 flex-shrink-0">{fmtAmt(item.total, prefs.currency)}</span>
                    </div>
                    {item.budget != null && (
                      <BudgetBar spent={item.total} budget={item.budget}
                        color={item.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <TrendingDown className="w-8 h-8 opacity-30" />
              <p className="text-sm">{t("dashboard.no_spending")}</p>
            </div>
          )}
        </div>

        {/* Goals progress — simplified */}
        {goalsSummary && goalsSummary.length > 0 && (
          <button
            onClick={() => navigate("/goals")}
            className="w-full text-left bg-card border border-border rounded-2xl p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">{t("dashboard.goals_progress")}</p>
            </div>
            <div className="space-y-3">
              {goalsSummary.slice(0, 5).map((item, i) => {
                const color = item.goalColor ?? CHART_COLORS[i % CHART_COLORS.length];
                const pct = item.divideByMonths && item.monthlyTarget && item.monthlyTarget > 0
                  ? Math.min((item.contributed / item.monthlyTarget) * 100, 100)
                  : Math.min(item.percentage, 100);
                return (
                  <div key={item.goalId} className="space-y-1">
                    <p className="text-xs font-medium truncate">{item.goalName}</p>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? "#34d399" : color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </button>
        )}

        {/* Monthly trend */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">{t("dashboard.monthly_trend")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={monthly ?? []}
              margin={{ top: 4, right: 4, left: -20, bottom: 4 }}
              onMouseMove={(state: any) => {
                if (state?.isTooltipActive && state?.activeCoordinate?.y !== undefined) {
                  const TOOLTIP_H = 54;
                  const GAP = 4;
                  const barY = state.activeCoordinate.y;
                  const chartTop = state.offset?.top ?? 0;
                  const spaceAbove = barY - chartTop;
                  setBarTooltipY(spaceAbove < TOOLTIP_H + GAP ? barY + GAP : barY - TOOLTIP_H - GAP);
                }
              }}
              onMouseLeave={() => setBarTooltipY(undefined)}
            >
              <XAxis dataKey="month" tickFormatter={localiseMonthStr} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtAmtRound(v, prefs.currency)} />
              <Tooltip
                content={<BarTooltipContent currency={prefs.currency} />}
                position={barTooltipY !== undefined ? { y: barTooltipY } : undefined}
                cursor={false}
              />
              <Bar
                dataKey="total"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                activeBar={(props: any) =>
                  props.total === 0
                    ? <g />
                    : <Rectangle {...props} fill="#bfdbfe" radius={[4, 4, 0, 0]} />
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
