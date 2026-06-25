import { useState } from "react";
import {
  useGetSpendingSummary,
  useGetMonthlySummary,
  useGetGoalsSummary,
} from "@workspace/api-client-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingDown, Target, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { loadPrefs, fmtAmt, fmtAmtRound } from "@/lib/prefs";
import { t, localiseMonthStr, fmtMonthYear } from "@/lib/i18n";

const CHART_COLORS = ["#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8", "#a78bfa", "#fbbf24"];

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
  const [viewDate, setViewDate] = useState(new Date());

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
              <div className="flex-shrink-0">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={spending} dataKey="total" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={64} paddingAngle={2}>
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

        {/* Goals contributions chart */}
        {goalsSummary && goalsSummary.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">{t("dashboard.goals_progress")}</p>
            </div>
            {activeGoalsWithContribs.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={goalsSummary.filter(g => g.contributed > 0)}
                        dataKey="contributed"
                        cx="50%" cy="50%"
                        innerRadius={38} outerRadius={64} paddingAngle={2}
                      >
                        {goalsSummary.filter(g => g.contributed > 0).map((entry, i) => (
                          <Cell key={entry.goalId} fill={entry.goalColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {goalsSummary.slice(0, 6).map((item, i) => {
                    const displayPct = item.divideByMonths && item.monthlyTarget && item.monthlyTarget > 0
                      ? Math.round((item.contributed / item.monthlyTarget) * 10000) / 100
                      : item.percentage;
                    const color = item.goalColor ?? CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <div key={item.goalId} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-muted-foreground truncate">{item.goalName}</span>
                          </div>
                          <span className="font-semibold ml-2 flex-shrink-0">{fmtAmt(item.contributed, prefs.currency)}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(displayPct, 100)}%`,
                              backgroundColor: displayPct >= 100 ? "#34d399" : color,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {displayPct.toFixed(0)}%{" "}
                          {item.divideByMonths && item.monthlyTarget
                            ? `${t("common.of")} ${fmtAmt(item.monthlyTarget, prefs.currency)}${t("dashboard.mo_target")}`
                            : `${t("common.of")} ${fmtAmtRound(item.budget, prefs.currency)} ${t("dashboard.total_goal")}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {goalsSummary.slice(0, 5).map((item, i) => (
                  <div key={item.goalId} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: item.goalColor ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground">{item.goalName}</span>
                      </div>
                      <span className="text-muted-foreground">{t("dashboard.no_contributions")}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1" />
                    <p className="text-[10px] text-muted-foreground">
                      {t("goals.target")} {fmtAmtRound(item.budget, prefs.currency)} {t("dashboard.by")} {item.deadline}
                      {item.monthlyTarget ? ` · ${fmtAmtRound(item.monthlyTarget, prefs.currency)}${t("dashboard.mo_needed")}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monthly trend */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">{t("dashboard.monthly_trend")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
              <XAxis dataKey="month" tickFormatter={localiseMonthStr} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtAmtRound(v, prefs.currency)} />
              <Tooltip
                formatter={(v: any) => [fmtAmt(Number(v), prefs.currency), t("dashboard.spent") ?? "Spent"]}
                contentStyle={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
