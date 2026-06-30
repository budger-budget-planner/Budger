import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
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

type GoalActivity = {
  id: number;
  type: string;
  goalId: number;
  goalName: string;
  goalColor: string;
  actorName: string | null;
  createdAt: string;
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

function GoalCard({ goal, summary, onEdit, currency, canEdit, canDelete, rates }: {
  goal: any; summary: any; onEdit: () => void; currency: string;
  canEdit: boolean; canDelete: boolean; rates: Record<string, number>;
}) {
  const sym = currencySymbol(currency);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  };
  const remove = useDeleteGoal({ mutation: { onSuccess: invalidate } });

  const contributed = summary?.contributed ?? 0;
  // Convert budget from the goal's canonical currency to the viewer's currency
  const rawBudget = parseFloat(goal.budget);
  const budget = goal.currency && goal.currency !== currency
    ? convertAmount(rawBudget, goal.currency, currency, rates)
    : rawBudget;
  const pct = budget > 0 ? Math.min((contributed / budget) * 100, 100) : 0;
  const ml = monthsLeft(goal.deadline);
  const monthlyTarget = goal.divideByMonths
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
              {t("goals.target_due", { amt: fmtAmtRound(Number(budget), currency), date: goal.deadline })}
            </p>
          </div>
        </div>

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
            <span>{fmtAmtRound(budget, currency)} {t("goals.goal_label")}</span>
          </div>
        </div>

        {monthlyTarget !== null && (
          <p className="text-xs text-muted-foreground mb-3">
            {t("goals.save_mo_for", { amt: fmtAmt(monthlyTarget, currency), ml, s: "" })}
          </p>
        )}

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
  );
}

function GoalFormFields({
  name, setName, color, setColor, budget, setBudget,
  deadline, setDeadline, divideByMonths, setDivideByMonths, sym, alreadyContributed = 0,
}: {
  name: string; setName: (v: string) => void;
  color: string; setColor: (v: string) => void;
  budget: string; setBudget: (v: string) => void;
  deadline: string; setDeadline: (v: string) => void;
  divideByMonths: boolean; setDivideByMonths: (v: boolean) => void;
  sym: string;
  alreadyContributed?: number;
}) {
  const ml = deadline ? monthsLeft(deadline) : null;
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
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("goals.deadline")}</Label>
        <DdMmYyyyInput value={deadline} onChange={setDeadline} required />
      </div>
      <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-muted/50 border border-border">
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
          onClick={() => setDivideByMonths(!divideByMonths)}
          className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            divideByMonths ? "bg-foreground" : "bg-muted border border-border"
          }`}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-background transition-all"
            style={{ left: divideByMonths ? "calc(100% - 1.375rem)" : "0.125rem" }}
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
  const [deadline, setDeadline]             = useState(goal.deadline);
  const [divideByMonths, setDivideByMonths] = useState(goal.divideByMonths);
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
    if (!name.trim() || !budget || !deadline) return;
    const budgetNum = parseFloat(budget);
    const canonicalBudget = goalCurrency !== userCurrency
      ? convertAmount(budgetNum, userCurrency, goalCurrency, rates)
      : budgetNum;
    update.mutate({ id: goal.id, data: { name: name.trim(), color, budget: canonicalBudget, deadline, divideByMonths } });
  }

  async function handleProposeEdit() {
    if (!name.trim() || !budget || !deadline) return;
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
        body: JSON.stringify({ name: name.trim(), color, budget: canonicalBudget, currency: goalCurrency, deadline, divideByMonths }),
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

  const { data: activityFeed, refetch: refetchActivity } = useQuery<GoalActivity[]>({
    queryKey: ["goal-activity"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/activity`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isInHousehold,
    refetchInterval: 30_000,
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

  async function dismissActivityItem(id: number) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/activity/${id}/dismiss`, {
      method: "POST", credentials: "include",
    });
    refetchActivity();
  }

  async function dismissAllActivity() {
    await fetch(`${import.meta.env.BASE_URL}api/goals/activity/dismiss-all`, {
      method: "POST", credentials: "include",
    });
    refetchActivity();
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
        setNewName(""); setNewColor("#818cf8"); setNewBudget(""); setNewDeadline(""); setNewDivide(false);
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
    if (!newName.trim() || !newBudget || !newDeadline) return;
    create.mutate({ data: { name: newName.trim(), color: newColor, budget: parseFloat(newBudget), currency: prefs.currency, deadline: newDeadline, divideByMonths: newDivide } });
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
                      <p className="text-sm font-medium truncate">
                        {ep.goalName !== ep.proposed.name ? (
                          <span className="line-through text-muted-foreground mr-1">{ep.goalName}</span>
                        ) : null}
                        {ep.proposed.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("goals.edit_proposed_by", { name: ep.proposerName ?? "" })}</p>
                      {oldBudget != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtAmtRound(oldBudget, prefs.currency)}
                          {" → "}
                          <span className="text-foreground font-medium">{fmtAmtRound(newBudget, prefs.currency)}</span>
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

      {/* Household Activity Feed — goal_changed / goal_completed_total / goal_completed_monthly */}
      {isInHousehold && activityFeed && activityFeed.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("goals.activity_feed")}</p>
            <span className="ml-auto text-xs bg-foreground text-background px-2 py-0.5 rounded-full font-medium">
              {activityFeed.length}
            </span>
            <button
              onClick={dismissAllActivity}
              className="text-xs text-muted-foreground hover:text-foreground transition active:opacity-70 ml-1"
            >
              {t("goals.dismiss_all")}
            </button>
          </div>
          <div className="divide-y divide-border">
            {activityFeed.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: (a.goalColor ?? "#818cf8") + "33" }}>
                  {a.type === "goal_completed_total" || a.type === "goal_completed_monthly"
                    ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: a.goalColor ?? "#818cf8" }} />
                    : <Target className="w-3.5 h-3.5" style={{ color: a.goalColor ?? "#818cf8" }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.goalName}</p>
                  {a.type === "goal_changed" && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("goals.goal_changed_notif", { name: a.actorName ?? "" })}
                    </p>
                  )}
                  {a.type === "goal_completed_total" && (
                    <p className="text-xs text-green-400 font-medium mt-0.5">
                      {t("goals.goal_completed_total_notif")}
                    </p>
                  )}
                  {a.type === "goal_completed_monthly" && (
                    <p className="text-xs text-green-400 font-medium mt-0.5">
                      {t("goals.goal_completed_monthly_notif", { name: a.goalName })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => dismissActivityItem(a.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition active:opacity-70 mt-0.5"
                  aria-label={t("goals.dismiss")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
                    <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} currency={prefs.currency} canEdit={canEdit(g)} canDelete={canDelete(g)} rates={rates} />
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
    </div>
  );
}
