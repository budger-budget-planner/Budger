import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, currencySymbol } from "@/lib/prefs";

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
  proposerName: string | null;
  status: string;
  createdAt: string;
};

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

function GoalCard({ goal, summary, onEdit, sym }: {
  goal: any; summary: any; onEdit: () => void; sym: string;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  };
  const remove = useDeleteGoal({ mutation: { onSuccess: invalidate } });

  const contributed = summary?.contributed ?? 0;
  const budget = parseFloat(goal.budget);
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
              {t("goals.target_due", { amt: `${sym}${Number(budget).toFixed(0)}`, date: goal.deadline })}
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
            <span>{sym}{contributed.toFixed(2)} {t("goals.saved_amt")}</span>
            <span>{sym}{budget.toFixed(0)} {t("goals.goal_label")}</span>
          </div>
        </div>

        {monthlyTarget !== null && (
          <p className="text-xs text-muted-foreground mb-3">
            {t("goals.save_mo_for", { amt: `${sym}${monthlyTarget.toFixed(2)}`, ml, s: "" })}
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
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
              <Pencil className="w-3.5 h-3.5" /> {t("goals.edit_btn")}
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70">
              <Trash2 className="w-3.5 h-3.5" /> {t("goals.delete_btn")}
            </button>
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
              ? t("goals.save_mo_for", { amt: `${sym}${monthly}`, ml: ml ?? 0, s: "" })
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
  isCreator, isInHousehold, householdId, onProposalsChange,
}: {
  goal: any; open: boolean; onClose: () => void; sym: string; alreadyContributed?: number;
  isCreator: boolean; isInHousehold: boolean; householdId: number | null;
  onProposalsChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName]                     = useState(goal.name);
  const [color, setColor]                   = useState(goal.color);
  const [budget, setBudget]                 = useState(String(Number(goal.budget).toFixed(0)));
  const [deadline, setDeadline]             = useState(goal.deadline);
  const [divideByMonths, setDivideByMonths] = useState(goal.divideByMonths);
  const [proposeState, setProposeState]     = useState<"idle" | "pending" | "sent" | "already">("idle");
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
    update.mutate({ id: goal.id, data: { name: name.trim(), color, budget: parseFloat(budget), deadline, divideByMonths } });
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

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> {t("common.cancel")}
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={update.isPending}>
            <Check className="w-3.5 h-3.5 mr-1" />
            {update.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PastGoalCard({ goal, sym }: { goal: any; sym: string }) {
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
              {sym}{Number(goal.budget).toFixed(0)} · {t("goals.ended")} {goal.deadline}
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

  const [addOpen,     setAddOpen]     = useState(false);
  const [editGoal,    setEditGoal]    = useState<any | null>(null);
  const [showPast,    setShowPast]    = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newColor,    setNewColor]    = useState("#818cf8");
  const [newBudget,   setNewBudget]   = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newDivide,   setNewDivide]   = useState(false);

  const { data: goals,     isLoading }                = useListGoals();
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

  const summaryMap = new Map((summary ?? []).map(s => [s.goalId, s]));

  const privateGoals   = (goals ?? []).filter(g => !(g as any).householdId);
  const householdGoals = (goals ?? []).filter(g => !!(g as any).householdId);
  const pendingProposals = (proposals ?? []).filter(p => p.status === "pending");

  const create = useCreateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        setAddOpen(false);
        setNewName(""); setNewColor("#818cf8"); setNewBudget(""); setNewDeadline(""); setNewDivide(false);
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newBudget || !newDeadline) return;
    create.mutate({ data: { name: newName.trim(), color: newColor, budget: parseFloat(newBudget), deadline: newDeadline, divideByMonths: newDivide } });
  }

  async function handleApproveProposal(proposalId: number) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/proposals/${proposalId}/approve`, {
      method: "POST", credentials: "include",
    });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
    refetchProposals();
  }

  async function handleDeclineProposal(proposalId: number) {
    await fetch(`${import.meta.env.BASE_URL}api/goals/proposals/${proposalId}/decline`, {
      method: "POST", credentials: "include",
    });
    refetchProposals();
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

      {/* Pending proposals banner — visible to creator only */}
      {isCreator && pendingProposals.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Goal Proposals</p>
            <span className="ml-auto text-xs bg-foreground text-background px-2 py-0.5 rounded-full font-medium">
              {pendingProposals.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {pendingProposals.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: (p.goalColor ?? "#818cf8") + "33" }}
                >
                  <Target className="w-3.5 h-3.5" style={{ color: p.goalColor ?? "#818cf8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.goalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("goals.proposed_by", { name: p.proposerName ?? "" })}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleDeclineProposal(p.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70"
                  >
                    {t("goals.decline")}
                  </button>
                  <button
                    onClick={() => handleApproveProposal(p.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium transition active:opacity-70"
                  >
                    {t("goals.approve")}
                  </button>
                </div>
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
                  <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} sym={sym} />
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
              <SectionHeader icon={Users} label={t("goals.household_goals")} count={householdGoals.length} />
              {householdGoals.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {householdGoals.map(g => (
                    <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} sym={sym} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-3">
                  {t("goals.no_household")}{" "}
                  {isCreator
                    ? t("goals.edit_private_hint")
                    : t("goals.propose_via_edit")}
                </p>
              )}
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
              {pastGoals.map(g => <PastGoalCard key={g.id} goal={g} sym={sym} />)}
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
          onProposalsChange={() => refetchProposals()}
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
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}>
                {create.isPending ? t("goals.creating_btn") : t("goals.create_btn")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
