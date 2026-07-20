import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { fetchRates, convertAmount } from "@/lib/rates";
import {
  useGetSpendingSummary,
  useGetMonthlySummary,
  useGetGoalsSummary,
  useListRecurringPayments,
  useListCategories,
  useUpdateMe,
  getGetMeQueryKey,
  useGetMe,
  useListHouseholdMembers,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Rectangle,
  PieChart, Pie, Cell,
} from "recharts";
import DonutBudgetChart from "@/components/DonutBudgetChart";
import { TrendingDown, Target, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { loadPrefs, savePrefs, fmtAmt, fmtAmtRound } from "@/lib/prefs";
import { AmtHero } from "@/components/AmtHero";
import { t, localiseMonthStr, fmtMonthYear } from "@/lib/i18n";
import { useLiveActivity } from "@/hooks/useLiveActivity";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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
  const [prefs, setPrefsState] = useState(() => loadPrefs());
  const [, navigate] = useLocation();
  const [viewDate, setViewDate] = useState(new Date());
  const [barTooltipY, setBarTooltipY] = useState<number | undefined>(undefined);
  const [rates, setRates] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  useEffect(() => { fetchRates().then(setRates); }, []);

  const isCurrentMonth = format(viewDate, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const viewMonth      = format(viewDate, "yyyy-MM");

  const { data: me }              = useGetMe();
  const { data: householdMembers } = useListHouseholdMembers({ query: { enabled: !!(me as any)?.householdId } as any });
  const myRole = (householdMembers ?? []).find((m: any) => m.userId === (me as any)?.id)?.role ?? "";
  const isHead = myRole === "head" || myRole === "owner";

  const { data: householdRPs } = useQuery<any[]>({
    queryKey: ["household-recurring-payments"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/household-recurring-payments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isHead && !!(me as any)?.householdId,
  });

  const { data: spendingRaw, isLoading: spendingLoading } = useGetSpendingSummary({ month: viewMonth, currency: prefs.currency } as any);
  const { data: recurringPayments } = useListRecurringPayments({ query: { enabled: isCurrentMonth } as any });
  const { data: categories } = useListCategories();
  const updateMe = useUpdateMe({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) } });

  // IDs of household RPs — used to exclude them from the donut chart entirely.
  const householdRpIds = new Set<number>((householdRPs ?? []).map((rp: any) => rp.id));

  // Merge ONLY un-applied PERSONAL recurring payments into spending as virtual budget segments.
  // Applied ones already exist as real transactions in the spending summary — adding them
  // again would double-count both the total and the donut segment.
  // Household RP transactions are stripped out so they never appear in the donut.
  const spending = (() => {
    const base = (spendingRaw ?? []).filter(item =>
      // Remove spending rows that came from an applied household RP transaction
      !(item.recurringPaymentId && householdRpIds.has(item.recurringPaymentId))
    );
    // For applied personal RP transactions the summary returns them with recurringPaymentId set
    // — give them a stable _catKey so the donut chart groups them separately from
    // the "uncategorized" bucket.
    const enrichedBase = base.map(item =>
      item.recurringPaymentId
        ? {
            ...item,
            _catKey: `rp-${item.recurringPaymentId}`,
            isRecurringApplied: true,
            isLarderDesignated: (recurringPayments ?? []).find((rp: any) => rp.id === item.recurringPaymentId)?.addToLarder ?? false,
          }
        : item
    );
    // recurringPayments is already scope='personal' only (the endpoint filters by scope)
    const unapplied = (recurringPayments ?? []).filter(rp => !rp.appliedThisMonth);
    if (!unapplied.length) return enrichedBase.length ? enrichedBase : undefined;
    const rpItems = unapplied.map(rp => ({
      categoryId: null as null,
      categoryName: rp.name,
      categoryColor: rp.color,
      total: 0,        // Not yet spent; real tx when applied is in category data
      budget: rp.amount,
      count: 0,
      recurringPaymentId: rp.id,
      _catKey: `rp-${rp.id}`,
      isRecurringApplied: false,
      isLarderDesignated: rp.addToLarder,
    }));
    const merged = [...enrichedBase, ...rpItems];
    return merged.length ? merged : undefined;
  })();
  const { data: monthly }    = useGetMonthlySummary({ currency: prefs.currency } as any);
  const { data: goalsSummary } = useGetGoalsSummary({ month: viewMonth });

  // Use raw (unfiltered) data for the stat tiles so household RP amounts aren't double-counted.
  // `spending` is the donut-only view (household RPs stripped); using it for totals would
  // already exclude household RPs, then personalSpending would subtract them again.
  const totalSpending = (spendingRaw ?? []).reduce((s, c) => s + c.total, 0);
  const totalBudget   = prefs.totalBudget ?? 0;
  const txCount       = (spendingRaw ?? []).reduce((s, c) => s + c.count, 0);

  // Household split — only relevant for head users
  const paidHouseholdRpSum = (householdRPs ?? [])
    .filter((rp: any) => rp.appliedThisMonth)
    .reduce((s: number, rp: any) => s + Number(rp.amount), 0);
  const personalSpending = Math.max(0, totalSpending - paidHouseholdRpSum);

  // Total budget passed to the donut: subtract household RP amounts so the chart
  // doesn't compute a phantom "uncategorized" slice for the household portion.
  const householdRpTotalAmount = (householdRPs ?? [])
    .reduce((s: number, rp: any) => s + Number(rp.amount), 0);
  const totalBudgetForChart = Math.max(0, totalBudget - householdRpTotalAmount);

  // Donut chart data: strip zero-total uncategorized rows (no category, no RP, nothing spent)
  const spendingForChart = spending?.filter(item =>
    !(item.categoryId == null && !(item as any).recurringPaymentId && item.total === 0 && item.count === 0)
  );

  // Sum of all category budgets + recurring payments — used to suggest a budget when none is set
  const catBudgetSum = (categories ?? []).reduce((s, c) => s + (c.budget != null ? Number(c.budget) : 0), 0);
  const rpBudgetSumDash = (recurringPayments ?? []).reduce((s, rp) => s + Number(rp.amount), 0);
  const combinedBudgetSum = catBudgetSum + rpBudgetSumDash;

  function setFromCategorySum() {
    const newTotal = Math.ceil(combinedBudgetSum);
    const current = loadPrefs();
    const updated = { ...current, totalBudget: newTotal };
    savePrefs(updated);
    setPrefsState(updated);
    updateMe.mutate({ data: { totalBudget: newTotal } });
  }

  const [realizedExcluded, setRealizedExcluded] = useState(0);
  useEffect(() => {
    fetch(`/api/summary/realized-excluded?month=${viewMonth}&currency=${prefs.currency}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.total === "number") setRealizedExcluded(d.total); })
      .catch(() => {});
  }, [viewMonth, prefs.currency]);

  // Convert each goal's contribution from its stored currency to the user's display currency
  function toUserCurrency(amount: number, goalCurrency: string | null): number {
    if (!goalCurrency || goalCurrency === prefs.currency || Object.keys(rates).length === 0) return amount;
    return convertAmount(amount, goalCurrency, prefs.currency, rates);
  }

  const totalGoalContributions = (goalsSummary ?? []).reduce((s, g) =>
    s + toUserCurrency(g.contributed, (g as any).goalCurrency), 0);
  const activeGoalsWithContribs = (goalsSummary ?? []).filter(g => g.contributed > 0);

  // Live Activity — auto-starts/updates the iOS Dynamic Island widget when running in Capacitor
  const topCategory = spending?.[0];
  useLiveActivity(spending ? {
    totalSpent: totalSpending,
    totalBudget,
    currencySymbol: prefs.currency,
    topCategoryName: topCategory?.categoryName ?? "Uncategorized",
    topCategoryColor: (topCategory as any)?.color ?? "#6366f1",
    transactionCount: txCount,
    householdName: "Budger",
    isCurrentMonth,
  } : null);

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

        {/* Row 1 — always visible */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.total_spent")}</p>
          <p className="text-2xl font-bold" data-testid="text-total-spent"><AmtHero amount={totalSpending} currency={prefs.currency} /></p>
          {realizedExcluded > 0 && (
            <p className="text-xs text-teal-400">+{fmtAmt(realizedExcluded, prefs.currency)} {t("home.realized_goal_excluded")}</p>
          )}
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
              {combinedBudgetSum > 0 && (
                <button
                  onClick={setFromCategorySum}
                  disabled={!isOnline}
                  className="mt-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300 transition active:opacity-70 hover:bg-amber-500/25 w-full disabled:opacity-40"
                >
                  <Target className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    {prefs.language === "pl"
                      ? `Ustaw ${fmtAmtRound(combinedBudgetSum, prefs.currency)}`
                      : `Set ${fmtAmtRound(combinedBudgetSum, prefs.currency)}`}
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Row 2 (middle) — head-of-household only */}
        {isHead && (
          <>
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.for_own")}</p>
              <p className="text-2xl font-bold"><AmtHero amount={personalSpending} currency={prefs.currency} /></p>
            </div>

            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.for_household")}</p>
              <p className="text-2xl font-bold"><AmtHero amount={paidHouseholdRpSum} currency={prefs.currency} /></p>
            </div>
          </>
        )}

        {/* Row 3 (was row 2) — Goals then Transactions */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.for_goals")}</p>
          <p className="text-2xl font-bold"><AmtHero amount={totalGoalContributions} currency={prefs.currency} /></p>
          <p className="text-xs text-muted-foreground">
            {activeGoalsWithContribs.length > 0
              ? prefs.language === "pl"
                ? `${activeGoalsWithContribs.length} ${activeGoalsWithContribs.length === 1 ? "cel aktywny" : "cele aktywne"}`
                : `${activeGoalsWithContribs.length} ${activeGoalsWithContribs.length !== 1 ? "goals" : "goal"} active`
              : t("dashboard.no_contributions")}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">{t("dashboard.transactions")}</p>
          <p className="text-2xl font-bold">{txCount}</p>
        </div>

      </div>

      {/* Charts */}
      <div className="space-y-4 mb-5">
        {/* Spending by Category — budget-based donut */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">{t("dashboard.by_category")}</p>
          {spendingLoading ? (
            <div className="h-44 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : spendingForChart && spendingForChart.length > 0 && totalBudgetForChart > 0 ? (
            <DonutBudgetChart
              spending={spendingForChart as any}
              totalBudget={totalBudgetForChart}
              currency={prefs.currency}
              hasData={
                spendingForChart.some(s => s.count > 0) ||
                (recurringPayments?.length ?? 0) > 0
              }
            />
          ) : spendingForChart && spendingForChart.length > 0 ? (
            /* Fallback: no total budget set — show spending-proportional donut */
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_.recharts-sector:focus]:outline-none">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart style={{ outline: "none" }}>
                    <Pie data={spendingForChart} dataKey="total" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={64} paddingAngle={2}
                      style={{ outline: "none" }}>
                      {spendingForChart.map((entry, i) => (
                        <Cell key={(entry as any)._catKey ?? entry.categoryId ?? `unc-${i}`}
                          fill={(entry as any).categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {spendingForChart.slice(0, 6).map((item, i) => (
                  <div key={(item as any)._catKey ?? item.categoryId ?? `unc-${i}`} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: (item as any).categoryColor ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground truncate">
                          {(!item.categoryName || item.categoryName === "Uncategorized") ? t("common.uncategorized") : item.categoryName}
                        </span>
                        {item.budget != null && item.total > item.budget && (
                          <span className="text-destructive font-medium flex-shrink-0">!</span>
                        )}
                      </div>
                      <span className="font-semibold ml-2 flex-shrink-0">{fmtAmt(item.total, prefs.currency)}</span>
                    </div>
                    {item.budget != null && (
                      <BudgetBar spent={item.total} budget={item.budget}
                        color={(item as any).categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
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
                const totalPct = Math.min((item as any).totalPercentage ?? item.percentage, 100);
                const monthlyPct = item.divideByMonths && item.monthlyTarget && item.monthlyTarget > 0
                  ? Math.min((item.contributed / item.monthlyTarget) * 100, 100)
                  : null;
                const barPct = monthlyPct ?? totalPct;
                return (
                  <div key={item.goalId} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium truncate">{item.goalName}</p>
                      <div className="flex items-baseline gap-1.5 flex-shrink-0 text-[10px] text-muted-foreground">
                        {monthlyPct !== null && (
                          <span className={monthlyPct >= 100 ? "text-[#34d399]" : ""}>
                            {monthlyPct.toFixed(0)}% mo
                          </span>
                        )}
                        {monthlyPct !== null && <span className="opacity-30">·</span>}
                        <span className={totalPct >= 100 ? "text-[#34d399]" : ""}>
                          {totalPct.toFixed(0)}% total
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${barPct}%`, backgroundColor: barPct >= 100 ? "#34d399" : color }}
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
