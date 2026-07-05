import { useState, useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import LarderTab from "@/pages/LarderTab";
import {
  useListGoals,
  useListPastGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useGetGoalsSummary,
  useGetMe,
  useGetHousehold,
  getListGoalsQueryKey,
  getListPastGoalsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Check, X, History,
  ChevronDown, ChevronRight, Target, Users, Lock, ArrowUpRight,
  Bell, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, currencySymbol, fmtAmt, fmtAmtRound } from "@/lib/prefs";
import { fetchRates, convertAmount } from "@/lib/rates";

const PRESET_COLORS = [
  "#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8",
  "#a78bfa", "#fbbf24", "#f87171", "#4ade80", "#60a5fa",
  "#e879f9", "#2dd4bf", "#facc15", "#fb7185", "#a3e635",
];

type Proposal = {
  id: number;
  goalId: number;
  goalName: string | null;
  goalColor: string | null;
  goalBudget: number | null;
  goalCurrency: string | null;
  proposerName: string | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
};

type MyShareProposal = {
  id: number;
  goalId: number;
  goalName: string | null;
  goalColor: string | null;
  goalBudget?: number | null;
  goalCurrency?: string | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
};

type MemberBreakdownRow = {
  userId: number;
  name: string;
  memberColor: string;
  allTimeAmount: number;
  currentMonthAmount: number;
  goalCurrency: string | null;
};

function localDismissedKey(userId: number | undefined) {
  return `goal_proposals_dismissed_${userId ?? "anon"}`;
}

function loadDismissed(userId: number | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(localDismissedKey(userId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(userId: number | undefined, dismissed: Set<string>) {
  try {
    localStorage.setItem(localDismissedKey(userId), JSON.stringify([...dismissed]));
  } catch {
    // ignore
  }
}

type EditProposal = {
  id: number;
  goalId: number;
  goalName: string | null;
  goalColor: string | null;
  currentBudget: number | null;
  currentCurrency: string | null;
  currentDeadline: string | null;
  currentDivideByMonths: boolean;
  proposerName: string | null;
  declineReason: string | null;
  proposed: {
    name: string;
    color: string;
    budget: number;
    currency: string | null;
    deadline: string;
    divideByMonths: boolean;
  };
  status: string;
  createdAt: string;
};

const EMPTY_RATES: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, PLN: 3.95 };

function DdMmYyyyInput({ value, onChange, required }: { value: string; onChange: (iso: string) => void; required?: boolean }) {
  function isoToDisplay(iso: string): string {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length === 3 && parts[2]) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return "";
  }
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += "/" + digits.slice(2, 4);
    if (digits.length > 4) formatted += "/" + digits.slice(4, 8);
    setDisplay(formatted);
    if (digits.length === 8) {
      onChange(`${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
    }
  }
  return (
    <Input type="text" placeholder={t("goals.date_placeholder")} value={display}
      onChange={handleChange} required={required} inputMode="numeric" />
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          className="w-7 h-7 rounded-full border-2 transition-all"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "white" : "transparent",
            outline: value === c ? `2px solid ${c}` : "none",
          }}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded-full cursor-pointer border border-border bg-transparent"
        title="Custom color"
      />
    </div>
  );
}

function monthsLeft(deadline: string): number {
  const d = new Date(deadline);
  const now = new Date();
  return Math.max(
    1,
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + 1
  );
}

function GoalCard({ goal, summary, onEdit, currency, canEdit, canDelete, rates, isHousehold }: {
  goal: any; summary: any; onEdit: () => void; currency: string;
  canEdit: boolean; canDelete: boolean; rates: Record<string, number>;
  isHousehold?: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  };
  const remove = useDeleteGoal({ mutation: { onSuccess: invalidate } });

  const { data: memberBreakdown, isLoading: breakdownLoading } = useQuery<MemberBreakdownRow[]>({
    queryKey: ["goal-member-breakdown", goal.id],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/${goal.id}/member-breakdown`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!isHousehold && expanded,
    staleTime: 60_000,
  });

  // Contributions are stored in the goal's base currency; convert to viewer's currency for display
  const contributedInGoalCurrency = summary?.totalContributed ?? 0;
  const hasRates = Object.keys(rates).length > 0;
  const goalCur = goal.currency;
  const contributed = goalCur && goalCur !== currency && hasRates
    ? convertAmount(contributedInGoalCurrency, goalCur, currency, rates)
    : contributedInGoalCurrency;
  const rawBudget = parseFloat(goal.budget);
  const budget = goalCur && goalCur !== currency && hasRates
    ? convertAmount(rawBudget, goalCur, currency, rates)
    : rawBudget;
  const pct = budget > 0 ? Math.min((contributed / budget) * 100, 100) : 0;
  const isTbd = goal.deadline === "TBD";
  const ml = isTbd ? null : monthsLeft(goal.deadline);
  const monthlyTarget = goal.divideByMonths && ml
    ? Math.ceil(Math.max(0, budget - contributed) / ml * 100) / 100
    : null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: goal.color }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex-shrink-0"
            style={{ backgroundColor: goal.color + "33" }}>
            <div className="w-full h-full rounded-xl flex items-center justify-center">
              <Target className="w-4 h-4" style={{ color: goal.color }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              {isTbd
                ? t("goals.target_due", { amt: fmtAmtRound(Number(budget), currency), date: t("goals.date_tbd") })
                : t("goals.target_due", { amt: fmtAmtRound(Number(budget), currency), date: goal.deadline })}
            </p>
          </div>
        </div>

        {/* Total progress bar */}
        <div className="mb-2 space-y-1">
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: pct >= 100 ? "#34d399" : goal.color,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{fmtAmt(contributed, currency)} {t("goals.saved_amt")}</span>
            <span className="font-medium">{t("goals.total_target")}: {fmtAmtRound(budget, currency)}</span>
          </div>
        </div>

        {/* Monthly target indicator */}
        {monthlyTarget !== null && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>{t("goals.monthly_target")}: {fmtAmt(monthlyTarget, currency)}</span>
            <span className="text-muted-foreground/60">{ml}mo {t("common.remaining")}</span>
          </div>
        )}

        {/* Realized banner — shown for any fully-funded goal still in active list */}
        {pct >= 100 && (() => {
          const realizedBannerText = (() => {
            if (!goal.realizedAt) return t("goals.realized_fully_funded");
            const moveAtMs = new Date(goal.realizedAt).getTime() + 24 * 60 * 60 * 1000;
            const hoursLeft = Math.ceil((moveAtMs - Date.now()) / (60 * 60 * 1000));
            return hoursLeft > 0
              ? t("goals.realized_moves_in", { hours: String(hoursLeft) })
              : t("goals.realized_moves_soon");
          })();
          return (
            <div className="mt-1 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-400">{realizedBannerText}</p>
            </div>
          );
        })()}

        {/* Household member contributions expansion (household goals only) */}
        {isHousehold && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground py-1.5 border-t border-border/50 mt-1 hover:text-foreground transition active:opacity-70"
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {t("goals.member_contributions")}
            </span>
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}

        {isHousehold && expanded && (
          <div className="mt-2 space-y-2.5">
            {breakdownLoading ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : !memberBreakdown || memberBreakdown.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-1">{t("goals.no_contributions_yet")}</p>
            ) : (
              memberBreakdown.map(m => {
                const gc = m.goalCurrency;
                const dispTotal = gc && gc !== currency && hasRates
                  ? convertAmount(m.allTimeAmount, gc, currency, rates) : m.allTimeAmount;
                const dispMonth = gc && gc !== currency && hasRates
                  ? convertAmount(m.currentMonthAmount, gc, currency, rates) : m.currentMonthAmount;
                return (
                  <div key={m.userId} className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 border"
                      style={{ backgroundColor: m.memberColor + "22", borderColor: m.memberColor }}
                    />
                    <span className="text-xs flex-1 truncate text-foreground/80">{m.name}</span>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-medium tabular-nums">{fmtAmt(dispTotal, currency)}</span>
                      {goal.divideByMonths && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({fmtAmt(dispMonth, currency)}/{t("goals.this_month")})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="mt-3">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                {t("common.cancel")}
              </button>
              <button onClick={() => remove.mutate({ id: goal.id })} disabled={remove.isPending}
                className="flex-1 py-2 rounded-xl bg-destructive text-xs font-medium text-destructive-foreground transition active:opacity-70 disabled:opacity-40">
                {remove.isPending ? t("common.deleting") : t("goals.delete_btn")}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {canEdit && (
                <button onClick={onEdit}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                             bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                  <Pencil className="w-3.5 h-3.5" /> {t("goals.edit_btn")}
                </button>
              )}
              {canDelete && (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                             bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70">
                  <Trash2 className="w-3.5 h-3.5" /> {t("goals.delete_btn")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalFormFields({
  name, setName, color, setColor, budget, setBudget,
  deadline, setDeadline, divideByMonths, setDivideByMonths,
  dateTbd, setDateTbd,
  sym, alreadyContributed = 0,
}: {
  name: string; setName: (v: string) => void;
  color: string; setColor: (v: string) => void;
  budget: string; setBudget: (v: string) => void;
  deadline: string; setDeadline: (v: string) => void;
  divideByMonths: boolean; setDivideByMonths: (v: boolean) => void;
  dateTbd: boolean; setDateTbd: (v: boolean) => void;
  sym: string;
  alreadyContributed?: number;
}) {
  const ml = (!dateTbd && deadline) ? monthsLeft(deadline) : null;
  const budgetNum = parseFloat(budget) || 0;
  const remaining = Math.max(0, budgetNum - alreadyContributed);
  const monthly = ml && budgetNum > 0 && divideByMonths
    ? (Math.ceil(remaining / ml * 100) / 100).toFixed(2)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: color }} />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("goals.goal_name")} autoFocus required />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("cat.color_label")}</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("goals.target_amt")}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={budget}
            onChange={e => setBudget(e.target.value)} className="pl-7" required />
        </div>
      </div>

      {/* Deadline row with TBD toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t("goals.deadline")}</Label>
          <button
            type="button"
            onClick={() => { setDateTbd(!dateTbd); if (!dateTbd) setDeadline(""); }}
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${dateTbd ? "text-foreground" : "text-foreground"}`}
          >
            <span className={`w-7 h-4 rounded-full relative transition-colors ${dateTbd ? "bg-foreground" : "bg-muted-foreground/50 border border-border"}`}>
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all"
                style={{ left: dateTbd ? "calc(100% - 0.875rem)" : "0.125rem" }} />
            </span>
            {t("goals.date_tbd")}
          </button>
        </div>
        {dateTbd ? (
          <div className="px-3 py-2.5 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground">
            {t("goals.date_tbd")}
          </div>
        ) : (
          <DdMmYyyyInput value={deadline} onChange={setDeadline} required={!dateTbd} />
        )}
      </div>

      <div className={`flex items-center gap-3 py-2 px-3 rounded-xl bg-muted/50 border border-border ${dateTbd ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex-1">
          <p className="text-sm font-medium">{t("goals.divide_mo")}</p>
          <p className="text-xs text-muted-foreground">
            {monthly
              ? t("goals.save_mo_for", { amt: fmtAmt(Number(monthly), loadPrefs().currency), ml: ml ?? 0, s: "" })
              : t("goals.calc_monthly")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => !dateTbd && setDivideByMonths(!divideByMonths)}
          className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            divideByMonths && !dateTbd ? "bg-foreground" : "bg-muted border border-border"
          }`}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-background transition-all"
            style={{ left: divideByMonths && !dateTbd ? "calc(100% - 1.375rem)" : "0.125rem" }}
          />
        </button>
      </div>
    </div>
  );
}

function EditGoalDialog({
  goal, open, onClose, sym, alreadyContributed = 0,
  isCreator, isInHousehold, householdId, onProposalsChange, rates, userCurrency, isNonHeadCreator,
}: {
  goal: any; open: boolean; onClose: () => void; sym: string; alreadyContributed?: number;
  isCreator: boolean; isInHousehold: boolean; householdId: number | null;
  onProposalsChange: () => void; rates: Record<string, number>; userCurrency: string;
  isNonHeadCreator: boolean;
}) {
  const queryClient = useQueryClient();
  const goalCurrency: string = goal.currency || userCurrency;
  const prefillBudget = goalCurrency !== userCurrency
    ? String(Math.round(convertAmount(Number(goal.budget), goalCurrency, userCurrency, rates)))
    : String(Number(goal.budget).toFixed(0));
  const [name, setName]                     = useState(goal.name);
  const [color, setColor]                   = useState(goal.color);
  const [budget, setBudget]                 = useState(prefillBudget);
  const [deadline, setDeadline]             = useState(goal.deadline === "TBD" ? "" : goal.deadline);
  const [divideByMonths, setDivideByMonths] = useState(goal.divideByMonths);
  const [dateTbd, setDateTbd]               = useState(goal.deadline === "TBD");
  const [proposeState, setProposeState]     = useState<"idle" | "pending" | "sent" | "already">("idle");
  const [editProposeState, setEditProposeState] = useState<"idle" | "pending" | "sent">("idle");
  const [togglingHousehold, setTogglingHousehold] = useState(false);

  const isHousehold = !!(goal as any).householdId;

  const update = useUpdateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        onClose();
      },
    },
  });

  const updateVisibility = useUpdateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        setTogglingHousehold(false);
        onClose();
      },
    },
  });

  function handleSave() {
    if (!name.trim() || !budget || (!deadline && !dateTbd)) return;
    const budgetNum = parseFloat(budget);
    const canonicalBudget = goalCurrency !== userCurrency
      ? convertAmount(budgetNum, userCurrency, goalCurrency, rates)
      : budgetNum;
    update.mutate({ id: goal.id, data: { name: name.trim(), color, budget: canonicalBudget, deadline: dateTbd ? "TBD" : deadline, divideByMonths: dateTbd ? false : divideByMonths } });
  }

  async function handleProposeEdit() {
    if (!name.trim() || !budget || (!deadline && !dateTbd)) return;
    setEditProposeState("pending");
    const budgetNum = parseFloat(budget);
    const canonicalBudget = goalCurrency !== userCurrency
      ? convertAmount(budgetNum, userCurrency, goalCurrency, rates)
      : budgetNum;
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/${goal.id}/propose-edit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color, budget: canonicalBudget, currency: goalCurrency, deadline: dateTbd ? "TBD" : deadline, divideByMonths: dateTbd ? false : divideByMonths }),
      });
      if (r.ok) {
        onProposalsChange();
        onClose();
      } else {
        setEditProposeState("idle");
      }
    } catch {
      setEditProposeState("idle");
    }
  }

  async function handleMakeHousehold() {
    if (!householdId) return;
    setTogglingHousehold(true);
    updateVisibility.mutate({ id: goal.id, data: { householdId } as any });
  }

  async function handleMakePrivate() {
    setTogglingHousehold(true);
    updateVisibility.mutate({ id: goal.id, data: { householdId: null } as any });
  }

  async function handlePropose() {
    setProposeState("pending");
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/${goal.id}/propose`, {
        method: "POST",
        credentials: "include",
      });
      if (r.status === 409) {
        setProposeState("already");
      } else if (r.ok) {
        setProposeState("sent");
        onProposalsChange();
      } else {
        setProposeState("idle");
      }
    } catch {
      setProposeState("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("goals.edit_title")}</DialogTitle></DialogHeader>
        <GoalFormFields
          name={name} setName={setName}
          color={color} setColor={setColor}
          budget={budget} setBudget={setBudget}
          deadline={deadline} setDeadline={setDeadline}
          divideByMonths={divideByMonths} setDivideByMonths={setDivideByMonths}
          dateTbd={dateTbd} setDateTbd={setDateTbd}
          sym={sym}
          alreadyContributed={alreadyContributed}
        />

        {/* Visibility section */}
        {isInHousehold && (
          <div className="border-t border-border pt-3 mt-1 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("goals.visibility")}</p>
            {isCreator ? (
              isHousehold ? (
                <button
                  type="button"
                  onClick={handleMakePrivate}
                  disabled={togglingHousehold}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition active:opacity-70 disabled:opacity-40"
                >
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{t("goals.make_private")}</p>
                    <p className="text-xs text-muted-foreground">{t("goals.remove_from_household")}</p>
                  </div>
                  {togglingHousehold && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleMakeHousehold}
                  disabled={togglingHousehold}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border text-sm text-muted-foreground hover:text-foreground transition active:opacity-70 disabled:opacity-40"
                >
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{t("goals.make_household")}</p>
                    <p className="text-xs text-muted-foreground">{t("goals.share_progress")}</p>
                  </div>
                  {togglingHousehold && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />}
                </button>
              )
            ) : !isHousehold ? (
              proposeState === "sent" || proposeState === "already" ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t("goals.proposal_sent")}</p>
                    <p className="text-xs text-muted-foreground">
                      {proposeState === "already" ? t("goals.awaiting_approval") : t("goals.awaiting_owner")}
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePropose}
                  disabled={proposeState === "pending"}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border text-sm hover:text-foreground transition active:opacity-70 disabled:opacity-40"
                >
                  <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{t("goals.propose_to_hh")}</p>
                    <p className="text-xs text-muted-foreground">{t("goals.request_shared")}</p>
                  </div>
                  {proposeState === "pending" && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />}
                </button>
              )
            ) : null}
          </div>
        )}

        {/* Edit-propose success state for non-head creators */}
        {isNonHeadCreator && isHousehold && editProposeState === "sent" && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border">
            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("goals.edit_proposal_sent")}</p>
              <p className="text-xs text-muted-foreground">{t("goals.awaiting_edit_approval")}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> {t("common.cancel")}
          </Button>
          {isNonHeadCreator && isHousehold ? (
            editProposeState === "sent" ? (
              <Button className="flex-1" onClick={onClose}>
                <Check className="w-3.5 h-3.5 mr-1" /> {t("common.done")}
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleProposeEdit} disabled={editProposeState === "pending"}>
                <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                {editProposeState === "pending" ? t("goals.proposing") : t("goals.propose_changes")}
              </Button>
            )
          ) : (
            <Button className="flex-1" onClick={handleSave} disabled={update.isPending}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {update.isPending ? t("common.saving") : t("common.save")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PastGoalCard({ goal, currency }: { goal: any; currency: string }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteGoal({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPastGoalsQueryKey() }),
    },
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden opacity-70">
      <div className="h-1.5" style={{ backgroundColor: goal.color }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl flex-shrink-0"
            style={{ backgroundColor: goal.color + "22" }}>
            <div className="w-full h-full rounded-xl flex items-center justify-center">
              <Target className="w-3.5 h-3.5" style={{ color: goal.color }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              {fmtAmtRound(Number(goal.budget), currency)} · {t("goals.ended")} {goal.deadline}
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground">
                {t("common.cancel")}
              </button>
              <button onClick={() => remove.mutate({ id: goal.id })} disabled={remove.isPending}
                className="px-2 py-1 rounded-lg bg-destructive text-xs text-destructive-foreground disabled:opacity-40">
                {remove.isPending ? "…" : t("goals.delete_btn")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg bg-muted text-muted-foreground">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  );
}

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const prefs = loadPrefs();
  const sym   = currencySymbol(prefs.currency);

  const [activeTab, setActiveTab] = useState<"goals" | "larder">("goals");

  const [rates, setRates] = useState<Record<string, number>>(EMPTY_RATES);
  useEffect(() => {
    fetchRates().then(setRates);
  }, []);

  const [addOpen,     setAddOpen]     = useState(false);
  const [editGoal,    setEditGoal]    = useState<any | null>(null);
  const [showPast,    setShowPast]    = useState(false);
  const [newName,               setNewName]               = useState("");
  const [newColor,              setNewColor]              = useState("#818cf8");
  const [newBudget,             setNewBudget]             = useState("");
  const [newDeadline,           setNewDeadline]           = useState("");
  const [newDivide,             setNewDivide]             = useState(false);
  const [newTbd,                setNewTbd]                = useState(false);
  const [newProposeToHousehold, setNewProposeToHousehold] = useState(false);
  const [proposingAfterCreate,  setProposingAfterCreate]  = useState(false);
  const [decliningShareId,  setDecliningShareId]  = useState<number | null>(null);
  const [declineShareReason, setDeclineShareReason] = useState("");
  const [decliningEditId,   setDecliningEditId]   = useState<number | null>(null);
  const [declineEditReason,  setDeclineEditReason]  = useState("");
  const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(new Set());

  const { data: goals,     isLoading }                = useListGoals({ query: { refetchInterval: 20_000, refetchOnWindowFocus: true } } as any);
  const { data: pastGoals, isLoading: pastLoading }   = useListPastGoals();
  const { data: summary }                             = useGetGoalsSummary({});
  const { data: me }                                  = useGetMe();
  const { data: household }                           = useGetHousehold({
    query: { enabled: !!me?.householdId, retry: false },
  } as any);

  const isInHousehold = !!me?.householdId;
  const isCreator = isInHousehold && !!household && !!me && (household as any).ownerId === me.id;
  const householdId = isInHousehold ? (me.householdId ?? null) : null;

  const { data: proposals, refetch: refetchProposals } = useQuery<Proposal[]>({
    queryKey: ["goal-proposals"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isCreator,
  });

  const { data: editProposals, refetch: refetchEditProposals } = useQuery<EditProposal[]>({
    queryKey: ["goal-edit-proposals"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isCreator,
  });

  const { data: myShareProposals, refetch: refetchMyShareProposals } = useQuery<MyShareProposal[]>({
    queryKey: ["goal-my-share-proposals"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/proposals/mine`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isInHousehold && !isCreator,
    refetchInterval: 20_000,
  });

  const { data: myEditProposalsMine, refetch: refetchMyEditProposalsMine } = useQuery<EditProposal[]>({
    queryKey: ["goal-my-edit-proposals-mine"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals/mine`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isInHousehold && !isCreator,
    refetchInterval: 20_000,
  });


  // Load dismissed proposals from localStorage when user loads
  useEffect(() => {
    if (me?.id) {
      setDismissedProposals(loadDismissed(me.id));
    }
  }, [me?.id]);


  const summaryMap = new Map((summary ?? []).map(s => [s.goalId, s]));

  const allPrivateGoals = (goals ?? []).filter(g => !(g as any).householdId);
  const householdGoals  = (goals ?? []).filter(g => !!(g as any).householdId);

  // Pending share proposals for this non-head user
  const pendingProposalGoalIds = new Set(
    (myShareProposals ?? []).filter(p => p.status === "pending").map(p => p.goalId)
  );
  // Move pending-proposed goals out of private section; show them greyed out in household section
  const privateGoals           = allPrivateGoals.filter(g => !pendingProposalGoalIds.has((g as any).id));
  const pendingHouseholdGoals  = allPrivateGoals.filter(g =>  pendingProposalGoalIds.has((g as any).id));
  const pendingProposals = (proposals ?? []).filter(p => p.status === "pending");
  const pendingEditProposals = (editProposals ?? []).filter(p => p.status === "pending");

  function refetchAllProposals() {
    refetchProposals();
    refetchEditProposals();
    refetchMyShareProposals();
    refetchMyEditProposalsMine();
  }

  function dismissProposal(key: string) {
    const next = new Set(dismissedProposals);
    next.add(key);
    setDismissedProposals(next);
    saveDismissed(me?.id, next);
  }

  const visibleShareProposals = (myShareProposals ?? [])
    .filter(p => !dismissedProposals.has(`share_${p.id}`));
  const visibleEditProposals  = (myEditProposalsMine ?? [])
    .filter(p => !dismissedProposals.has(`edit_${p.id}`));
  const hasMyProposals = visibleShareProposals.length > 0 || visibleEditProposals.length > 0;

  const create = useCreateGoal({
    mutation: {
      onSuccess: async (created: any) => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        if (newProposeToHousehold && created?.id) {
          setProposingAfterCreate(true);
          try {
            await fetch(`${import.meta.env.BASE_URL}api/goals/${created.id}/propose`, {
              method: "POST", credentials: "include",
            });
            refetchMyShareProposals();
            queryClient.invalidateQueries({ queryKey: ["goal-my-share-proposals-badge"] });
          } finally {
            setProposingAfterCreate(false);
          }
        }
        setAddOpen(false);
        setNewName(""); setNewColor("#818cf8"); setNewBudget(""); setNewDeadline(""); setNewDivide(false); setNewTbd(false);
        setNewProposeToHousehold(false);
      },
    },
  });

  const deleteGoalForProposal = useDeleteGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        refetchMyShareProposals();
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newBudget || (!newDeadline && !newTbd)) return;
    create.mutate({ data: { name: newName.trim(), color: newColor, budget: parseFloat(newBudget), currency: prefs.currency, deadline: newTbd ? "TBD" : newDeadline, divideByMonths: newTbd ? false : newDivide } });
  }

  // Household goal: head OR original creator can edit (via propose-edit for creator)
  function canEdit(goal: any): boolean {
    if (!goal.householdId) return true;
    return isCreator || goal.userId === me?.id;
  }

  // Only head can delete household goals; anyone can delete their own private goals
  function canDelete(goal: any): boolean {
    if (!goal.householdId) return goal.userId === me?.id;
    return isCreator;
  }

  // Whether user is the goal creator but NOT the head (edits need approval)
  function isNonHeadCreator(goal: any): boolean {
    return !isCreator && goal.userId === me?.id && !!goal.householdId;
  }

  async function handleApproveProposal(proposalId: number) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/proposals/${proposalId}/approve`, {
      method: "POST", credentials: "include",
    });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
    refetchProposals();
  }

  async function handleDeclineProposal(proposalId: number, reason: string) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/proposals/${proposalId}/decline`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    setDecliningShareId(null);
    setDeclineShareReason("");
    refetchProposals();
  }

  async function handleApproveEditProposal(proposalId: number) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals/${proposalId}/approve`, {
      method: "POST", credentials: "include",
    });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
    refetchEditProposals();
  }

  async function handleDeclineEditProposal(proposalId: number, reason: string) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals/${proposalId}/decline`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    setDecliningEditId(null);
    setDeclineEditReason("");
    refetchEditProposals();
  }

  return (
    <div className="px-4 pt-5 pb-4 max-w-2xl mx-auto">

      {/* ── Tab bar ── */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted mb-5">
        {(["goals", "larder"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === tab
                ? "bg-foreground text-background shadow"
                : "text-muted-foreground"
            }`}
          >
            {tab === "goals" ? t("goals.tab_goals") : t("goals.tab_larder")}
          </button>
        ))}
      </div>

      {/* ── Larder tab ── */}
      {activeTab === "larder" && <LarderTab />}

      {/* ── Goals tab content ── */}
      {activeTab === "goals" && <>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">{t("goals.title")}</h1>
          <p className="text-muted-foreground text-xs mt-0.5">{t("goals.page_subtitle")}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> {t("goals.new_btn")}
        </button>
      </div>

      {/* Pending proposals banner — share proposals (visible to head only) */}
      {isCreator && pendingProposals.length > 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("goals.proposals")}</p>
            <span className="ml-auto text-xs bg-foreground text-background px-2 py-0.5 rounded-full font-medium">
              {pendingProposals.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {pendingProposals.map(p => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: (p.goalColor ?? "#818cf8") + "33" }}>
                    <Target className="w-3.5 h-3.5" style={{ color: p.goalColor ?? "#818cf8" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.goalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("goals.proposed_by", { name: p.proposerName ?? "" })}
                      {p.goalBudget != null && (
                        <span className="ml-1">· {fmtAmtRound(
                          p.goalCurrency && p.goalCurrency !== prefs.currency
                            ? convertAmount(p.goalBudget, p.goalCurrency, prefs.currency, rates)
                            : p.goalBudget, prefs.currency)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => { setDecliningShareId(p.id); setDeclineShareReason(""); }}
                      className="px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                      {t("goals.decline")}
                    </button>
                    <button onClick={() => handleApproveProposal(p.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium transition active:opacity-70">
                      {t("goals.approve")}
                    </button>
                  </div>
                </div>
                {decliningShareId === p.id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={declineShareReason}
                      onChange={e => setDeclineShareReason(e.target.value)}
                      placeholder={t("goals.decline_reason_placeholder")}
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-border"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setDecliningShareId(null)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                        {t("common.cancel")}
                      </button>
                      <button onClick={() => handleDeclineProposal(p.id, declineShareReason)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-destructive/20 text-xs font-medium text-destructive transition active:opacity-70">
                        {t("goals.confirm_decline")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending edit proposals — visible to head only */}
      {isCreator && pendingEditProposals.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("goals.edit_proposals")}</p>
            <span className="ml-auto text-xs bg-foreground text-background px-2 py-0.5 rounded-full font-medium">
              {pendingEditProposals.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {pendingEditProposals.map(ep => {
              const propCur = ep.proposed.currency || prefs.currency;
              const oldBudget = ep.currentBudget != null
                ? (ep.currentCurrency && ep.currentCurrency !== prefs.currency
                    ? convertAmount(ep.currentBudget, ep.currentCurrency, prefs.currency, rates)
                    : ep.currentBudget)
                : null;
              const newBudget = propCur !== prefs.currency
                ? convertAmount(ep.proposed.budget, propCur, prefs.currency, rates)
                : ep.proposed.budget;
              const nameChanged = ep.goalName !== ep.proposed.name;
              const colorChanged = ep.goalColor !== ep.proposed.color;
              const budgetChanged = oldBudget != null && Math.abs(oldBudget - newBudget) > 0.005;
              const deadlineChanged = ep.currentDeadline !== ep.proposed.deadline;
              const divideChanged = ep.currentDivideByMonths !== ep.proposed.divideByMonths;
              return (
                <div key={ep.id} className="px-4 py-3">
                  <div className="flex items-start gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: (ep.proposed.color ?? ep.goalColor ?? "#818cf8") + "33" }}
                    >
                      <Target className="w-3.5 h-3.5" style={{ color: ep.proposed.color ?? ep.goalColor ?? "#818cf8" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">{t("goals.edit_proposed_by", { name: ep.proposerName ?? "" })}</p>
                      {nameChanged && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">{t("goals.goal_name")}: </span>
                          <span className="line-through text-muted-foreground mr-1">{ep.goalName}</span>
                          <span className="text-foreground font-medium">→ {ep.proposed.name}</span>
                        </p>
                      )}
                      {!nameChanged && (
                        <p className="text-sm font-medium truncate">{ep.proposed.name}</p>
                      )}
                      {colorChanged && (
                        <p className="text-xs mt-0.5 flex items-center gap-1.5">
                          <span className="text-muted-foreground">{t("cat.color_label")}: </span>
                          <span className="w-3 h-3 rounded-full inline-block border border-border/50" style={{ backgroundColor: ep.goalColor ?? "#818cf8" }} />
                          <span className="text-muted-foreground">→</span>
                          <span className="w-3 h-3 rounded-full inline-block border border-border/50" style={{ backgroundColor: ep.proposed.color }} />
                        </p>
                      )}
                      {budgetChanged && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">{t("goals.target_amt")}: </span>
                          <span className="line-through text-muted-foreground mr-1">{fmtAmtRound(oldBudget!, prefs.currency)}</span>
                          <span className="text-foreground font-medium">→ {fmtAmtRound(newBudget, prefs.currency)}</span>
                        </p>
                      )}
                      {deadlineChanged && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">{t("goals.deadline")}: </span>
                          <span className="line-through text-muted-foreground mr-1">{ep.currentDeadline ?? "—"}</span>
                          <span className="text-foreground font-medium">→ {ep.proposed.deadline === "TBD" ? t("goals.date_tbd") : ep.proposed.deadline}</span>
                        </p>
                      )}
                      {divideChanged && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">{t("goals.divide_mo")}: </span>
                          <span className="text-foreground font-medium">{ep.proposed.divideByMonths ? t("common.on") : t("common.off")}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => { setDecliningEditId(ep.id); setDeclineEditReason(""); }}
                        className="px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                        {t("goals.decline")}
                      </button>
                      <button onClick={() => handleApproveEditProposal(ep.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium transition active:opacity-70">
                        {t("goals.approve")}
                      </button>
                    </div>
                  </div>
                  {decliningEditId === ep.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={declineEditReason}
                        onChange={e => setDeclineEditReason(e.target.value)}
                        placeholder={t("goals.decline_reason_placeholder")}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-border"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setDecliningEditId(null)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                          {t("common.cancel")}
                        </button>
                        <button onClick={() => handleDeclineEditProposal(ep.id, declineEditReason)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-destructive/20 text-xs font-medium text-destructive transition active:opacity-70">
                          {t("goals.confirm_decline")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Proposals panel — dismissible per item, shows pending/approved/declined */}
      {!isCreator && isInHousehold && hasMyProposals && (
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("goals.my_proposals")}</p>
          </div>
          <div className="divide-y divide-border">
            {visibleShareProposals.map(p => {
              const color = p.goalColor ?? "#818cf8";
              return (
                <div key={`share-${p.id}`} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: color + "33" }}>
                    <Target className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.goalName}</p>
                    {p.status === "pending" && (
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {t("goals.proposal_pending_title")}
                      </p>
                    )}
                    {p.status === "approved" && (
                      <p className="text-xs text-green-400 font-medium flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> {t("goals.share_approved_title")}
                      </p>
                    )}
                    {p.status === "declined" && (
                      <>
                        <p className="text-xs text-destructive font-medium mt-0.5">{t("goals.share_declined_title")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.declineReason
                            ? t("goals.declined_reason", { reason: p.declineReason })
                            : t("goals.no_reason_given")}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              deleteGoalForProposal.mutate({ id: p.goalId });
                              dismissProposal(`share_${p.id}`);
                            }}
                            disabled={deleteGoalForProposal.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-medium transition active:opacity-70 disabled:opacity-40"
                          >
                            <Trash2 className="w-3 h-3" /> {t("goals.delete_goal")}
                          </button>
                          <button
                            onClick={() => dismissProposal(`share_${p.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium transition active:opacity-70"
                          >
                            <Lock className="w-3 h-3" /> {t("goals.keep_as_personal")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {p.status !== "declined" && (
                    <button
                      onClick={() => dismissProposal(`share_${p.id}`)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition active:opacity-70 mt-0.5"
                      aria-label={t("goals.dismiss")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {visibleEditProposals.map(ep => {
              const color = ep.goalColor ?? "#818cf8";
              return (
                <div key={`edit-${ep.id}`} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: color + "33" }}>
                    <Pencil className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ep.goalName}</p>
                    {ep.status === "pending" && (
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {t("goals.proposal_pending_title")}
                      </p>
                    )}
                    {ep.status === "approved" && (
                      <p className="text-xs text-green-400 font-medium flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> {t("goals.edit_approved_title")}
                      </p>
                    )}
                    {ep.status === "declined" && (
                      <>
                        <p className="text-xs text-destructive font-medium mt-0.5">{t("goals.edit_declined_title")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ep.declineReason
                            ? t("goals.declined_reason", { reason: ep.declineReason })
                            : t("goals.no_reason_given")}
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => dismissProposal(`edit_${ep.id}`)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition active:opacity-70 mt-0.5"
                    aria-label={t("goals.dismiss")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Private Goals */}
          <div className="mb-5">
            {isInHousehold && (
              <SectionHeader icon={Lock} label={t("goals.private_goals")} count={privateGoals.length} />
            )}
            {privateGoals.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {privateGoals.map(g => (
                  <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} currency={prefs.currency} canEdit={canEdit(g)} canDelete={canDelete(g)} rates={rates} />
                ))}
              </div>
            ) : !isInHousehold ? (
              <div className="text-center py-16 flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Target className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">{t("goals.no_active")}</p>
                <button onClick={() => setAddOpen(true)}
                  className="px-5 py-2.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95">
                  {t("goals.create_first")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3">{t("goals.no_private")}</p>
            )}
          </div>

          {/* Household Goals */}
          {isInHousehold && (
            <div className="mb-5">
              <SectionHeader icon={Users} label={t("goals.household_goals")} count={householdGoals.length + pendingHouseholdGoals.length} />
              {/* Pending proposed goals — greyed out, only visible to proposer */}
              {pendingHouseholdGoals.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {pendingHouseholdGoals.map(g => (
                    <div key={`pending-${g.id}`} className="relative opacity-50 pointer-events-none select-none">
                      <GoalCard goal={g} summary={undefined} onEdit={() => {}} currency={prefs.currency} canEdit={false} canDelete={false} rates={rates} />
                      <div className="absolute inset-0 flex items-start justify-end p-3 pointer-events-none">
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-black/60 text-white px-2 py-0.5 rounded-full">
                          {t("goals.pending_hh_badge")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {householdGoals.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {householdGoals.map(g => (
                    <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} currency={prefs.currency} canEdit={canEdit(g)} canDelete={canDelete(g)} rates={rates} isHousehold />
                  ))}
                </div>
              ) : pendingHouseholdGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  {t("goals.no_household")}{" "}
                  {isCreator
                    ? t("goals.edit_private_hint")
                    : t("goals.propose_via_edit")}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Past Goals */}
      <button
        onClick={() => setShowPast(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 mb-3
                   bg-card border border-border rounded-2xl text-sm font-medium
                   transition active:opacity-70"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span>{t("goals.past_goals")}</span>
          {pastGoals && pastGoals.length > 0 && (
            <span className="text-xs text-muted-foreground">({pastGoals.length})</span>
          )}
        </div>
        {showPast
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {showPast && (
        <div className="space-y-3 mb-4">
          {pastLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : pastGoals && pastGoals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pastGoals.map(g => <PastGoalCard key={g.id} goal={g} currency={prefs.currency} />)}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-6">{t("goals.no_past")}</p>
          )}
        </div>
      )}

      {/* Edit dialog */}
      {editGoal && (
        <EditGoalDialog
          goal={editGoal}
          open={!!editGoal}
          onClose={() => setEditGoal(null)}
          sym={sym}
          alreadyContributed={summaryMap.get(editGoal.id)?.contributed ?? 0}
          isCreator={isCreator}
          isInHousehold={isInHousehold}
          householdId={householdId}
          onProposalsChange={refetchAllProposals}
          rates={rates}
          userCurrency={prefs.currency}
          isNonHeadCreator={isNonHeadCreator(editGoal)}
        />
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("goals.new")}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-0">
            <GoalFormFields
              name={newName} setName={setNewName}
              color={newColor} setColor={setNewColor}
              budget={newBudget} setBudget={setNewBudget}
              deadline={newDeadline} setDeadline={setNewDeadline}
              divideByMonths={newDivide} setDivideByMonths={setNewDivide}
              dateTbd={newTbd} setDateTbd={setNewTbd}
              sym={sym}
            />
            {/* Propose-to-household toggle (non-head members only) */}
            {isInHousehold && !isCreator && (
              <button
                type="button"
                onClick={() => setNewProposeToHousehold(v => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 mt-3 rounded-xl bg-muted/50 border border-border transition active:opacity-70"
              >
                <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">{t("goals.propose_on_create")}</p>
                  <p className="text-xs text-muted-foreground">{t("goals.propose_on_create_desc")}</p>
                </div>
                <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${newProposeToHousehold ? "bg-foreground" : "bg-muted border border-border"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-all ${newProposeToHousehold ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
                </div>
              </button>
            )}
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending || proposingAfterCreate}>
                {(create.isPending || proposingAfterCreate) ? t("goals.creating_btn") : t("goals.create_btn")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      </>}
    </div>
  );
}
