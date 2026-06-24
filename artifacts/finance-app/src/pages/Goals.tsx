import { useState } from "react";
import {
  useListGoals,
  useListPastGoals,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useGetGoalsSummary,
  getListGoalsQueryKey,
  getListPastGoalsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X, History, ChevronDown, ChevronRight, Target } from "lucide-react";
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

function GoalCard({ goal, summary, onEdit, sym }: { goal: any; summary: any; onEdit: () => void; sym: string }) {
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
  const monthlyTarget = goal.divideByMonths ? Math.round((budget / ml) * 100) / 100 : null;

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
              Target: {sym}{Number(budget).toFixed(0)} · Due {goal.deadline}
            </p>
          </div>
        </div>

        {/* Progress bar */}
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
            <span>{sym}{contributed.toFixed(2)} saved</span>
            <span>{sym}{budget.toFixed(0)} goal</span>
          </div>
        </div>

        {monthlyTarget !== null && (
          <p className="text-xs text-muted-foreground mb-3">
            Save {sym}{monthlyTarget.toFixed(2)}/mo · {ml} month{ml !== 1 ? "s" : ""} left
          </p>
        )}

        {confirmDelete ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded-xl bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
              Cancel
            </button>
            <button onClick={() => remove.mutate({ id: goal.id })} disabled={remove.isPending}
              className="flex-1 py-2 rounded-xl bg-destructive text-xs font-medium text-destructive-foreground transition active:opacity-70 disabled:opacity-40">
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalFormFields({
  name, setName, color, setColor, budget, setBudget,
  deadline, setDeadline, divideByMonths, setDivideByMonths, sym,
}: {
  name: string; setName: (v: string) => void;
  color: string; setColor: (v: string) => void;
  budget: string; setBudget: (v: string) => void;
  deadline: string; setDeadline: (v: string) => void;
  divideByMonths: boolean; setDivideByMonths: (v: boolean) => void;
  sym: string;
}) {
  const ml = deadline ? monthsLeft(deadline) : null;
  const budgetNum = parseFloat(budget) || 0;
  const monthly = ml && budgetNum > 0 && divideByMonths ? (budgetNum / ml).toFixed(2) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: color }} />
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name" autoFocus required />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Color</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Target amount</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={budget}
            onChange={e => setBudget(e.target.value)} className="pl-7" required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Deadline</Label>
        <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required />
      </div>

      <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-muted/50 border border-border">
        <div className="flex-1">
          <p className="text-sm font-medium">Divide by months left</p>
          <p className="text-xs text-muted-foreground">
            {monthly
              ? `Save ${sym}${monthly}/mo for ${ml} month${ml !== 1 ? "s" : ""}`
              : "Calculate required monthly savings"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDivideByMonths(!divideByMonths)}
          className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            divideByMonths ? "bg-foreground" : "bg-muted border border-border"
          }`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-all ${
            divideByMonths ? "left-5.5 translate-x-0" : "left-0.5"
          }`}
            style={{ left: divideByMonths ? "calc(100% - 1.375rem)" : "0.125rem" }}
          />
        </button>
      </div>
    </div>
  );
}

function EditGoalDialog({ goal, open, onClose, sym }: { goal: any; open: boolean; onClose: () => void; sym: string }) {
  const queryClient = useQueryClient();
  const [name, setName]                     = useState(goal.name);
  const [color, setColor]                   = useState(goal.color);
  const [budget, setBudget]                 = useState(String(Number(goal.budget).toFixed(0)));
  const [deadline, setDeadline]             = useState(goal.deadline);
  const [divideByMonths, setDivideByMonths] = useState(goal.divideByMonths);

  const update = useUpdateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        onClose();
      },
    },
  });

  function handleSave() {
    if (!name.trim() || !budget || !deadline) return;
    update.mutate({ id: goal.id, data: { name: name.trim(), color, budget: parseFloat(budget), deadline, divideByMonths } });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Goal</DialogTitle></DialogHeader>
        <GoalFormFields
          name={name} setName={setName}
          color={color} setColor={setColor}
          budget={budget} setBudget={setBudget}
          deadline={deadline} setDeadline={setDeadline}
          divideByMonths={divideByMonths} setDivideByMonths={setDivideByMonths}
          sym={sym}
        />
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={update.isPending}>
            <Check className="w-3.5 h-3.5 mr-1" />
            {update.isPending ? "Saving…" : "Save"}
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
              {sym}{Number(goal.budget).toFixed(0)} · Ended {goal.deadline}
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex gap-1">
              <button onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-lg bg-muted text-xs text-muted-foreground">
                Cancel
              </button>
              <button onClick={() => remove.mutate({ id: goal.id })} disabled={remove.isPending}
                className="px-2 py-1 rounded-lg bg-destructive text-xs text-destructive-foreground disabled:opacity-40">
                {remove.isPending ? "…" : "Delete"}
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

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const prefs = loadPrefs();
  const sym   = currencySymbol(prefs.currency);

  const [addOpen,        setAddOpen]        = useState(false);
  const [editGoal,       setEditGoal]       = useState<any | null>(null);
  const [showPast,       setShowPast]       = useState(false);
  const [newName,        setNewName]        = useState("");
  const [newColor,       setNewColor]       = useState("#818cf8");
  const [newBudget,      setNewBudget]      = useState("");
  const [newDeadline,    setNewDeadline]    = useState("");
  const [newDivide,      setNewDivide]      = useState(false);

  const { data: goals,     isLoading } = useListGoals();
  const { data: pastGoals, isLoading: pastLoading } = useListPastGoals();
  const { data: summary }             = useGetGoalsSummary({});

  const summaryMap = new Map((summary ?? []).map(s => [s.goalId, s]));

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

  return (
    <div className="px-4 pt-5 pb-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold">Goals</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Track savings toward your targets</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : goals && goals.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} summary={summaryMap.get(g.id)} onEdit={() => setEditGoal(g)} sym={sym} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 flex flex-col items-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Target className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No active goals yet.</p>
          <button onClick={() => setAddOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95">
            Create first goal
          </button>
        </div>
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
          <span>Past Goals</span>
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
            <p className="text-center text-sm text-muted-foreground py-6">No past goals yet.</p>
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
        />
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Goal</DialogTitle></DialogHeader>
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
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
