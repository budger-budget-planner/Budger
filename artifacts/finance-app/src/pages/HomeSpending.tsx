import { useState, useRef } from "react";
import {
  useListTransactions,
  useListCategories,
  useListGoals,
  useListGoalContributions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useUploadReceipt,
  useDeleteReceipt,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSpendingHistoryQueryKey,
  getGetGoalsSummaryQueryKey,
  getListGoalContributionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Camera, X, ZoomIn, ImageOff, Image, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { compressImage } from "@/lib/imageUtils";
import { loadPrefs, savePrefs, currencySymbol, fmtAmt } from "@/lib/prefs";

type TxFormState = {
  amount: string;
  description: string;
  categoryId: string;
  date: string;
  paymentMethod: string;
  isGoalExpense: boolean;
  goalId: string;
  goalAmount: string;
};

function TxForm({ initial, categories, goals, onSubmit, onCancel, loading }: {
  initial: TxFormState;
  categories: any[];
  goals: any[];
  onSubmit: (d: TxFormState) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TxFormState>(initial);
  function set<K extends keyof TxFormState>(k: K, v: TxFormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  const txAmount = parseFloat(form.amount) || 0;
  const goalAmountNum = parseFloat(form.goalAmount) || 0;
  const goalAmountError = form.isGoalExpense && form.goalAmount && goalAmountNum > txAmount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.isGoalExpense && (!form.goalId || form.goalId === "none")) return;
    if (goalAmountError) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Amount</Label>
        <Input
          data-testid="input-amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={form.amount}
          onChange={e => set("amount", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input
          data-testid="input-description"
          placeholder="Coffee, groceries…"
          value={form.description}
          onChange={e => set("description", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
          <SelectTrigger data-testid="select-category">
            <SelectValue placeholder="No category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Goal toggle */}
      {goals.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Partially a Goal expense</p>
              <p className="text-xs text-muted-foreground">Count part of this expense toward a goal</p>
            </div>
            <Switch
              checked={form.isGoalExpense}
              onCheckedChange={v => set("isGoalExpense", v)}
            />
          </div>

          {form.isGoalExpense && (
            <div className="space-y-3 pt-1 border-t border-border/60">
              <div className="space-y-1.5">
                <Label>Goal</Label>
                <Select value={form.goalId} onValueChange={v => set("goalId", v)} required={form.isGoalExpense}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a goal" />
                  </SelectTrigger>
                  <SelectContent>
                    {goals.map(g => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                          {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Amount toward goal</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={form.amount || undefined}
                  placeholder={`up to ${form.amount || "0.00"}`}
                  value={form.goalAmount}
                  onChange={e => set("goalAmount", e.target.value)}
                  required={form.isGoalExpense}
                />
                {goalAmountError && (
                  <p className="text-xs text-destructive">Cannot exceed transaction amount</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            data-testid="input-date"
            type="date"
            value={form.date}
            onChange={e => set("date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Payment</Label>
          <Select value={form.paymentMethod} onValueChange={v => set("paymentMethod", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="apple_pay">Apple Pay</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={loading || !!goalAmountError || (form.isGoalExpense && (!form.goalId || form.goalId === "none"))}
          data-testid="button-save-transaction"
        >
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function ReceiptModal({ tx, open, onClose, sym }: { tx: any; open: boolean; onClose: () => void; sym: string }) {
  const queryClient  = useQueryClient();
  const cameraRef    = useRef<HTMLInputElement>(null);
  const libraryRef   = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const uploadReceipt = useUploadReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});
  const deleteReceipt = useDeleteReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageData = await compressImage(file);
      uploadReceipt.mutate({ id: tx.id, data: { imageData } });
    } catch {
      alert("Could not process image. Please try again.");
    }
    e.target.value = "";
  }

  return (
    <>
      <Dialog open={open && !lightbox} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt — {tx.description}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sym}{Number(tx.amount).toFixed(2)}</span>
              {" "}· {tx.categoryName ?? "Uncategorized"} · {tx.date}
            </div>
            {tx.receiptImage ? (
              <div className="relative group rounded-xl overflow-hidden border border-border">
                <img src={tx.receiptImage} alt="Receipt"
                  className="w-full object-cover max-h-64 cursor-pointer"
                  onClick={() => setLightbox(true)} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors
                                flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" onClick={() => setLightbox(true)} className="gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" /> View
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => deleteReceipt.mutate({ id: tx.id })}
                    disabled={deleteReceipt.isPending} className="gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                </div>
                {(uploadReceipt.isPending || deleteReceipt.isPending) && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
                <ImageOff className="w-8 h-8 opacity-40" />
                <p className="text-sm text-center">No receipt attached yet.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2"
                onClick={() => cameraRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Camera className="w-4 h-4" />
                {uploadReceipt.isPending ? "Uploading…" : "Camera"}
              </Button>
              <Button variant="outline" className="gap-2"
                onClick={() => libraryRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Image className="w-4 h-4" /> Library
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && tx.receiptImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(false)}>
            <X className="w-6 h-6" />
          </button>
          <img src={tx.receiptImage} alt="Receipt full size"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileChange} />
      <input ref={libraryRef} type="file" accept="image/*"
        className="hidden" onChange={handleFileChange} />
    </>
  );
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingHistoryQueryKey() });
}

function dateToMonth(dateStr: string): string {
  // dateStr is "yyyy-MM-dd"; derive month from it
  return dateStr.slice(0, 7);
}

async function syncGoalContribution(opts: {
  txId: number;
  txDate: string;
  isGoalExpense: boolean;
  goalId: string;
  goalAmount: string;
  existingContribId: number | null;
  queryClient: ReturnType<typeof useQueryClient>;
  viewMonth: string;
}) {
  const { txId, txDate, isGoalExpense, goalId, goalAmount, existingContribId, queryClient, viewMonth } = opts;

  // Delete existing contribution for this transaction if any
  if (existingContribId != null) {
    await fetch(`/api/goal-contributions/${existingContribId}`, {
      method: "DELETE",
      credentials: "include",
    });
  }

  // Create new contribution if needed
  if (isGoalExpense && goalId && goalId !== "none" && parseFloat(goalAmount) > 0) {
    const month = dateToMonth(txDate);
    await fetch("/api/goal-contributions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId: parseInt(goalId),
        transactionId: txId,
        amount: parseFloat(goalAmount),
        month,
      }),
    });
  }

  queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: viewMonth }) });
}

export default function HomeSpending() {
  const queryClient = useQueryClient();

  const [prefs, setPrefsState] = useState(() => loadPrefs());
  const sym = currencySymbol(prefs.currency);

  const [viewDate,    setViewDate]    = useState(new Date());
  const [addOpen,     setAddOpen]     = useState(false);
  const [editTx,      setEditTx]      = useState<any | null>(null);
  const [receiptTx,   setReceiptTx]   = useState<any | null>(null);
  const [actionTx,    setActionTx]    = useState<number | null>(null);
  const [budgetOpen,  setBudgetOpen]  = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const monthStart     = startOfMonth(viewDate);
  const monthEnd       = endOfMonth(viewDate);
  const fromStr        = format(monthStart, "yyyy-MM-dd");
  const toStr          = format(monthEnd,   "yyyy-MM-dd");
  const isCurrentMonth = format(viewDate, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const viewMonth      = format(viewDate, "yyyy-MM");

  const { data: categories }    = useListCategories();
  const { data: goals }         = useListGoals();
  const { data: contributions } = useListGoalContributions(
    { month: viewMonth },
    { query: { queryKey: getListGoalContributionsQueryKey({ month: viewMonth }) } }
  );
  const { data: transactions, isLoading } = useListTransactions({ startDate: fromStr, endDate: toStr } as any);

  // Map transactionId → contribution (for display + edit pre-fill)
  const contribByTxId = new Map<number, { id: number; goalId: number; name: string; color: string; amount: number }>();
  for (const c of contributions ?? []) {
    if (c.transactionId != null && c.goalName) {
      contribByTxId.set(c.transactionId, {
        id: c.id,
        goalId: c.goalId,
        name: c.goalName,
        color: c.goalColor ?? "#888",
        amount: c.amount,
      });
    }
  }

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setAddOpen(false); } } });
  const update = useUpdateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setEditTx(null); } } });
  const remove = useDeleteTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setActionTx(null); } } });

  const sorted = [...(transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total  = sorted.reduce((s, tx) => s + Number(tx.amount), 0);

  const totalBudget = prefs.totalBudget;
  const budgetPct   = totalBudget ? Math.min((total / totalBudget) * 100, 100) : 0;
  const remaining   = totalBudget ? totalBudget - total : null;

  const blank: TxFormState = {
    amount: "", description: "", categoryId: "none",
    date: format(new Date(), "yyyy-MM-dd"), paymentMethod: "card",
    isGoalExpense: false, goalId: "none", goalAmount: "",
  };

  function handleCreate(form: TxFormState) {
    const categoryId = form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null;
    create.mutate(
      { data: { amount: parseFloat(form.amount), description: form.description, categoryId, date: form.date, paymentMethod: form.paymentMethod } },
      {
        onSuccess: async (tx: any) => {
          invalidateAll(queryClient);
          setAddOpen(false);
          await syncGoalContribution({
            txId: tx.id,
            txDate: form.date,
            isGoalExpense: form.isGoalExpense,
            goalId: form.goalId,
            goalAmount: form.goalAmount,
            existingContribId: null,
            queryClient,
            viewMonth,
          });
        },
      }
    );
  }

  function handleUpdate(form: TxFormState) {
    if (!editTx) return;
    const categoryId = form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null;
    const existingContrib = contribByTxId.get(editTx.id) ?? null;

    update.mutate(
      {
        id: editTx.id,
        data: {
          amount: parseFloat(form.amount),
          description: form.description,
          categoryId,
          date: form.date,
          paymentMethod: form.paymentMethod,
        },
      },
      {
        onSuccess: async () => {
          invalidateAll(queryClient);
          setEditTx(null);
          await syncGoalContribution({
            txId: editTx.id,
            txDate: form.date,
            isGoalExpense: form.isGoalExpense,
            goalId: form.goalId,
            goalAmount: form.goalAmount,
            existingContribId: existingContrib?.id ?? null,
            queryClient,
            viewMonth,
          });
        },
      }
    );
  }

  function buildEditInitial(tx: any): TxFormState {
    const contrib = contribByTxId.get(tx.id);
    return {
      amount: String(tx.amount),
      description: tx.description,
      categoryId: tx.categoryId ? String(tx.categoryId) : "none",
      date: tx.date,
      paymentMethod: tx.paymentMethod,
      isGoalExpense: !!contrib,
      goalId: contrib ? String(contrib.goalId) : "none",
      goalAmount: contrib ? String(contrib.amount) : "",
    };
  }

  function saveTotalBudget(val: number | null) {
    const next = { ...prefs, totalBudget: val };
    savePrefs(next);
    setPrefsState(next);
    setBudgetOpen(false);
    setBudgetInput("");
  }

  const grouped: Record<string, typeof sorted> = {};
  for (const tx of sorted) {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Total budget banner ── */}
      <div className="px-5 pt-4 pb-0">
        {totalBudget == null ? (
          <button
            onClick={() => { setBudgetInput(""); setBudgetOpen(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl
                       bg-white/5 border border-white/10 text-left transition active:opacity-70"
            data-testid="button-set-budget"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-white/50" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Set your total monthly budget</p>
              <p className="text-xs text-white/40">Track how close you are to your limit</p>
            </div>
            <Plus className="w-4 h-4 text-white/30 flex-shrink-0" />
          </button>
        ) : (
          <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium">Monthly Budget</span>
              </div>
              <button
                className="text-xs text-white/40 hover:text-white/70"
                onClick={() => { setBudgetInput(String(totalBudget)); setBudgetOpen(true); }}
              >
                Edit
              </button>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">{fmtAmt(total, prefs.currency)}</span>
              <span className="text-sm text-white/40">of {fmtAmt(totalBudget, prefs.currency)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${budgetPct}%`,
                  backgroundColor: total > totalBudget ? "#f87171" : "#818cf8",
                }}
              />
            </div>
            <p className={`text-xs ${remaining != null && remaining < 0 ? "text-red-400" : "text-white/40"}`}>
              {remaining != null && remaining >= 0
                ? `${fmtAmt(remaining, prefs.currency)} remaining`
                : remaining != null
                  ? `${fmtAmt(-remaining, prefs.currency)} over budget`
                  : ""}
            </p>
          </div>
        )}
      </div>

      {/* ── Month header ── */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center transition active:scale-90">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{format(viewDate, "MMMM yyyy")}</p>
            {isCurrentMonth && <p className="text-xs text-muted-foreground">current month</p>}
          </div>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            disabled={isCurrentMonth}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center transition active:scale-90 disabled:opacity-30">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Total card */}
        <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Total spent</p>
            <p className="text-3xl font-bold text-foreground">{sym}{total.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Entries</p>
            <p className="text-3xl font-bold text-foreground">{sorted.length}</p>
          </div>
        </div>
      </div>

      {/* ── Transaction list ── */}
      <div className="flex-1 px-5 space-y-5 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <p className="text-sm">No spending logged for this month.</p>
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Add first entry
            </Button>
          </div>
        ) : (
          dates.map(date => (
            <div key={date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {format(new Date(date + "T12:00:00"), "EEE, d MMM")}
              </p>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {grouped[date].map(tx => {
                  const contrib = contribByTxId.get(tx.id);
                  const dotColor = tx.categoryColor ?? "#666";
                  const categoryLabel = tx.categoryName ?? "Uncategorized";

                  return (
                    <div key={tx.id}>
                      <div
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted/40 cursor-pointer"
                        onClick={() => setActionTx(actionTx === tx.id ? null : tx.id)}
                      >
                        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: dotColor + "33" }}>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {categoryLabel}
                            {tx.receiptImage ? " · 📎" : ""}
                            {contrib && (
                              <span
                                className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: contrib.color + "33", color: contrib.color }}
                              >
                                🎯 {contrib.name} {sym}{contrib.amount.toFixed(2)}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground flex-shrink-0">
                          −{sym}{Number(tx.amount).toFixed(2)}
                        </p>
                      </div>

                      {actionTx === tx.id && (
                        <div className="flex gap-2 px-3 pb-3">
                          <button onClick={() => { setReceiptTx(tx); setActionTx(null); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                            <Camera className="w-3.5 h-3.5" /> Receipt
                          </button>
                          <button onClick={() => { setEditTx(tx); setActionTx(null); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => remove.mutate({ id: tx.id })}
                            disabled={remove.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70 disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Floating add button ── */}
      <button
        onClick={() => setAddOpen(true)}
        data-testid="button-add-transaction"
        className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-foreground text-background
                   shadow-xl flex items-center justify-center transition active:scale-90"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Add dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
          <TxForm
            initial={blank}
            categories={categories ?? []}
            goals={goals ?? []}
            onSubmit={handleCreate}
            onCancel={() => setAddOpen(false)}
            loading={create.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          {editTx && (
            <TxForm
              initial={buildEditInitial(editTx)}
              categories={categories ?? []}
              goals={goals ?? []}
              onSubmit={handleUpdate}
              onCancel={() => setEditTx(null)}
              loading={update.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Receipt modal ── */}
      {receiptTx && (
        <ReceiptModal tx={receiptTx} open={!!receiptTx} onClose={() => setReceiptTx(null)} sym={sym} />
      )}

      {/* ── Set/edit total budget dialog ── */}
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Monthly Budget</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              saveTotalBudget(budgetInput ? parseFloat(budgetInput) : null);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Total monthly budget</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
                <Input
                  data-testid="input-total-budget"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3000"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">This is your total spending cap for the month. Leave blank to remove.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setBudgetOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">Save</Button>
            </div>
            {totalBudget != null && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive text-xs"
                onClick={() => saveTotalBudget(null)}
              >
                Remove budget
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
