import { useState, useRef } from "react";
import { compressImage } from "@/lib/imageUtils";
import {
  useListTransactions,
  useListCategories,
  useListGoals,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useUploadReceipt,
  useDeleteReceipt,
  useCreateGoalContribution,
  useListGoalContributions,
  useDeleteGoalContribution,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSpendingHistoryQueryKey,
  getListGoalContributionsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Camera, X, ZoomIn, ImageOff, Image, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { loadPrefs, currencySymbol } from "@/lib/prefs";

type TxFormState = {
  amount: string;
  description: string;
  categoryId: string;
  date: string;
  paymentMethod: string;
};

function TxForm({
  initial,
  categories,
  goals,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: TxFormState;
  categories: any[];
  goals: any[];
  onSubmit: (data: TxFormState) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TxFormState>(initial);
  function set(k: keyof TxFormState, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const allCatOptions = [
    ...categories.map(c => ({ id: c.id, name: c.name, color: c.color, isGoal: false })),
    ...goals.map(g => ({ id: `goal_${g.id}`, name: `${g.name} (Goal)`, color: g.color, isGoal: true })),
  ];

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Amount</Label>
        <Input data-testid="input-amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input data-testid="input-description" placeholder="Coffee, groceries..." value={form.description} onChange={e => set("description", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
          <SelectTrigger data-testid="select-category"><SelectValue placeholder="No category" /></SelectTrigger>
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
            {goals.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t border-border mt-1 pt-2">
                  Goals
                </div>
                {goals.map(g => (
                  <SelectItem key={`goal_${g.id}`} value={`goal_${g.id}`}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      {g.name} (Goal)
                    </span>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input data-testid="input-date" type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
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
        <Button type="submit" className="flex-1" disabled={loading} data-testid="button-save-transaction">
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function DedicateToGoalSection({ tx, goals }: { tx: any; goals: any[] }) {
  const queryClient = useQueryClient();
  const sym = currencySymbol(loadPrefs().currency);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: existingContribs } = useListGoalContributions(
    { month: currentMonth },
    { query: { enabled: goals.length > 0, queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) } }
  );

  const txContribs = (existingContribs ?? []).filter(c => c.transactionId === tx.id);

  const [goalId, setGoalId]     = useState("");
  const [amount, setAmount]     = useState("");
  const [saving, setSaving]     = useState(false);

  const addContrib = useCreateGoalContribution({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
        setGoalId(""); setAmount(""); setSaving(false);
      },
      onError: () => setSaving(false),
    },
  });

  const removeContrib = useDeleteGoalContribution({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) });
        queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
      },
    },
  });

  if (goals.length === 0) return null;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!goalId || !amount) return;
    setSaving(true);
    addContrib.mutate({
      data: {
        goalId: parseInt(goalId),
        transactionId: tx.id,
        amount: parseFloat(amount),
        month: currentMonth,
      },
    });
  }

  return (
    <div className="border-t border-border pt-4 mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">Dedicate to Goal</p>
      </div>

      {txContribs.length > 0 && (
        <div className="space-y-1.5">
          {txContribs.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.goalColor ?? "#818cf8" }} />
                <span className="text-sm text-muted-foreground">{c.goalName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{sym}{Number(c.amount).toFixed(2)}</span>
                <button onClick={() => removeContrib.mutate({ id: c.id })}
                  className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Select value={goalId} onValueChange={setGoalId}>
          <SelectTrigger className="flex-1 text-sm h-9">
            <SelectValue placeholder="Choose goal…" />
          </SelectTrigger>
          <SelectContent>
            {goals.map(g => (
              <SelectItem key={g.id} value={String(g.id)}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-28">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{sym}</span>
          <Input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="pl-6 h-9 text-sm"
          />
        </div>
        <Button type="submit" size="sm" disabled={saving || !goalId || !amount} className="h-9 px-3">
          {saving ? "…" : "Add"}
        </Button>
      </form>
    </div>
  );
}

function ReceiptModal({
  tx,
  open,
  onClose,
}: {
  tx: any;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sym = currencySymbol(loadPrefs().currency);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const uploadReceipt = useUploadReceipt({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
      },
    },
  });
  const deleteReceipt = useDeleteReceipt({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
      },
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const imageData = await compressImage(file);
      uploadReceipt.mutate({ id: tx.id, data: { imageData } });
    } catch {
      alert("Could not process image. Please try again.");
    }
  }

  return (
    <>
      <Dialog open={open && !lightbox} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Receipt — {tx.description}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sym}{Number(tx.amount).toFixed(2)}</span>
              {" "}· {tx.categoryName ?? "Uncategorized"} · {tx.date}
            </div>

            {tx.receiptImage ? (
              <div className="relative group rounded-xl overflow-hidden border border-border">
                <img
                  src={tx.receiptImage}
                  alt="Receipt"
                  className="w-full object-cover max-h-64 cursor-pointer"
                  onClick={() => setLightbox(true)}
                  data-testid="img-receipt"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" onClick={() => setLightbox(true)} className="gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteReceipt.mutate({ id: tx.id })}
                    disabled={deleteReceipt.isPending}
                    data-testid="button-delete-receipt"
                    className="gap-1.5"
                  >
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
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => cameraRef.current?.click()}
                disabled={uploadReceipt.isPending}
                data-testid="button-capture-receipt"
              >
                <Camera className="w-4 h-4" />
                Camera
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => libraryRef.current?.click()}
                disabled={uploadReceipt.isPending}
                data-testid="button-library-receipt"
              >
                <Image className="w-4 h-4" />
                Library
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && tx.receiptImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(false)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={tx.receiptImage}
            alt="Receipt full size"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-receipt-camera"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-receipt-library"
      />
    </>
  );
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, month?: string) {
  qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingHistoryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  if (month) qc.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month }) });
}

const paymentLabel: Record<string, string> = {
  card: "Card",
  apple_pay: "Apple Pay",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
};

export default function TransactionsPage() {
  const prefs = loadPrefs();
  const sym   = currencySymbol(prefs.currency);
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTx, setEditTx] = useState<any | null>(null);
  const [receiptTx, setReceiptTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: categories } = useListCategories();
  const { data: goals }      = useListGoals();
  const { data: transactions, isLoading } = useListTransactions(
    filterCat !== "all" ? { categoryId: parseInt(filterCat) } : {}
  );
  const { data: allContribs } = useListGoalContributions({ month: currentMonth });

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient, currentMonth); setAddOpen(false); } } });
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction({ mutation: { onSuccess: () => invalidateAll(queryClient) } });

  const filtered = (transactions ?? []).filter(tx => {
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (startDate && tx.date < startDate) return false;
    if (endDate && tx.date > endDate) return false;
    return true;
  });

  const blank: TxFormState = {
    amount: "",
    description: "",
    categoryId: "none",
    date: format(new Date(), "yyyy-MM-dd"),
    paymentMethod: "card",
  };

  function resolveCategory(form: TxFormState): { categoryId: number | null; goalContribution?: { goalId: number; amount: number } } {
    if (!form.categoryId || form.categoryId === "none") return { categoryId: null };
    if (form.categoryId.startsWith("goal_")) {
      const goalId = parseInt(form.categoryId.replace("goal_", ""));
      return { categoryId: null, goalContribution: { goalId, amount: parseFloat(form.amount) } };
    }
    return { categoryId: parseInt(form.categoryId) };
  }

  function handleCreate(form: TxFormState) {
    const { categoryId, goalContribution } = resolveCategory(form);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    create.mutate(
      { data: { amount: parseFloat(form.amount), description: form.description, categoryId, date: form.date, paymentMethod: form.paymentMethod } },
      {
        onSuccess: (tx) => {
          if (goalContribution) {
            queryClient.fetchQuery({
              queryKey: ["createGoalContrib"],
            }).catch(() => {});
            fetch("/api/goal-contributions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                goalId: goalContribution.goalId,
                transactionId: (tx as any).id,
                amount: goalContribution.amount,
                month,
              }),
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month }) });
            });
          }
        },
      }
    );
  }

  async function handleUpdate(form: TxFormState) {
    if (!editTx) return;
    const txId = editTx.id;
    const { categoryId, goalContribution } = resolveCategory(form);

    try {
      await update.mutateAsync({
        id: txId,
        data: {
          amount: parseFloat(form.amount),
          description: form.description,
          categoryId,
          date: form.date,
          paymentMethod: form.paymentMethod,
        },
      });

      if (goalContribution) {
        // Remove any existing contributions linked to this transaction for this month
        const contribsRes = await fetch(`/api/goal-contributions?month=${currentMonth}`, { credentials: "include" });
        const contribs: any[] = await contribsRes.json();
        const linked = (contribs ?? []).filter((c: any) => c.transactionId === txId);
        await Promise.all(
          linked.map((c: any) =>
            fetch(`/api/goal-contributions/${c.id}`, { method: "DELETE", credentials: "include" })
          )
        );
        await fetch("/api/goal-contributions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goalId: goalContribution.goalId,
            transactionId: txId,
            amount: goalContribution.amount,
            month: currentMonth,
          }),
        });
      }

      invalidateAll(queryClient, currentMonth);
      setEditTx(null);
    } catch {
      // error is surfaced by the mutation's built-in error state
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction" className="gap-2">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44" data-testid="select-filter-category"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input data-testid="input-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
        <Input data-testid="input-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No transactions found.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="divide-y divide-border">
            {filtered.map(tx => {
              const goalContrib = !tx.categoryId
                ? (allContribs ?? []).find((c: any) => c.transactionId === tx.id)
                : null;
              const displayName  = tx.categoryName ?? (goalContrib ? `${goalContrib.goalName} (Goal)` : "Uncategorized");
              const displayColor = tx.categoryColor ?? goalContrib?.goalColor ?? "#94a3b8";
              return (
                <div key={tx.id} data-testid={`row-transaction-${tx.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      {tx.receiptImage && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <Camera className="w-2.5 h-2.5" /> receipt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{displayName} · {paymentLabel[tx.paymentMethod] ?? tx.paymentMethod}{tx.userName ? ` · ${tx.userName}` : ""}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{tx.date}</span>
                  <span className="font-semibold text-sm w-20 text-right flex-shrink-0">{sym}{Number(tx.amount).toFixed(2)}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      title="Receipt"
                      data-testid={`button-receipt-${tx.id}`}
                      onClick={() => setReceiptTx(tx)}
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      data-testid={`button-edit-transaction-${tx.id}`}
                      onClick={() => setEditTx(tx)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      data-testid={`button-delete-transaction-${tx.id}`}
                      onClick={() => remove.mutate({ id: tx.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
          <TxForm initial={blank} categories={categories ?? []} goals={goals ?? []} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} loading={create.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          {editTx && (
            <>
              <TxForm
                initial={{ amount: String(editTx.amount), description: editTx.description, categoryId: editTx.categoryId ? String(editTx.categoryId) : "none", date: editTx.date, paymentMethod: editTx.paymentMethod }}
                categories={categories ?? []}
                goals={goals ?? []}
                onSubmit={handleUpdate}
                onCancel={() => setEditTx(null)}
                loading={update.isPending}
              />
              <DedicateToGoalSection tx={editTx} goals={goals ?? []} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt modal */}
      {receiptTx && (
        <ReceiptModal
          tx={receiptTx}
          open={!!receiptTx}
          onClose={() => setReceiptTx(null)}
        />
      )}
    </div>
  );
}
