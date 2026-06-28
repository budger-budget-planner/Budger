import { useState, useRef } from "react";
import { t } from "@/lib/i18n";
import { compressImage } from "@/lib/imageUtils";
import { CurrencyConvertSheet } from "@/components/CurrencyConvertSheet";
import {
  useListTransactions,
  useListCategories,
  useListGoals,
  useCreateTransaction,
  useDeleteTransaction,
  useUploadReceipt,
  useDeleteReceipt,
  useCreateGoalContribution,
  useListGoalContributions,
  useDeleteGoalContribution,
  useUpdateMerchantCategoryRule,
  listMerchantCategoryRules,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSpendingHistoryQueryKey,
  getListGoalContributionsQueryKey,
  getGetGoalsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Camera, X, ZoomIn, ImageOff, Image, Target, RefreshCw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { loadPrefs, currencySymbol, fmtAmt } from "@/lib/prefs";

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
        <Label>{t("common.amount")}</Label>
        <Input data-testid="input-amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>{t("home.description")}</Label>
        <Input data-testid="input-description" placeholder={t("tx.grocery_placeholder")} value={form.description} onChange={e => set("description", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>{t("home.category")}</Label>
        <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
          <SelectTrigger data-testid="select-category"><SelectValue placeholder={t("home.no_category")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("home.no_category")}</SelectItem>
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
                  {t("tx.goals_group")}
                </div>
                {goals.map(g => (
                  <SelectItem key={`goal_${g.id}`} value={`goal_${g.id}`}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      {g.name} ({t("tx.goal")})
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
          <Label>{t("common.date")}</Label>
          <Input data-testid="input-date" type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>{t("home.payment")}</Label>
          <Select value={form.paymentMethod} onValueChange={v => set("paymentMethod", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="card">{t("home.card")}</SelectItem>
              <SelectItem value="apple_pay">{t("ob.apple_pay")}</SelectItem>
              <SelectItem value="cash">{t("home.cash")}</SelectItem>
              <SelectItem value="bank_transfer">{t("home.bank_transfer")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" className="flex-1" disabled={loading} data-testid="button-save-transaction">
          {loading ? t("common.saving") : t("common.save")}
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
        <p className="text-sm font-medium">{t("tx.dedicate")}</p>
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
                <span className="text-sm font-medium">{fmtAmt(Number(c.amount), loadPrefs().currency)}</span>
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
            <SelectValue placeholder={t("tx.choose_goal")} />
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
          {saving ? "…" : t("tx.add_btn")}
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
      alert(t("tx.image_error"));
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
              <span className="font-medium text-foreground">{fmtAmt(Number(tx.amount), loadPrefs().currency)}</span>
              {" "}· {tx.categoryName ?? t("common.uncategorized")} · {tx.date}
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

function getPaymentLabel(): Record<string, string> {
  return {
    card: t("home.card"),
    apple_pay: t("ob.apple_pay"),
    cash: t("home.cash"),
    bank_transfer: t("home.bank_transfer"),
  };
}

export default function TransactionsPage() {
  const prefs = loadPrefs();
  const sym   = currencySymbol(prefs.currency);
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTx, setEditTx] = useState<any | null>(null);
  const [receiptTx, setReceiptTx] = useState<any | null>(null);
  const [convertTx, setConvertTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [autoRulePrompt, setAutoRulePrompt] = useState<{ merchantName: string; oldCategoryName: string } | null>(null);
  const updateMerchantRule = useUpdateMerchantCategoryRule();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: categories } = useListCategories();
  const { data: goals }      = useListGoals();
  const { data: transactions, isLoading } = useListTransactions(
    filterCat !== "all" ? { categoryId: parseInt(filterCat) } : {}
  );
  const { data: allContribs } = useListGoalContributions({ month: currentMonth });
  const [isSaving, setIsSaving] = useState(false);

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient, currentMonth); setAddOpen(false); } } });
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
    if (!editTx || isSaving) return;
    const txId = editTx.id;
    const { categoryId, goalContribution } = resolveCategory(form);

    // Was this an auto-assigned category that the user is now overriding?
    const wasAutoAssigned = editTx.categoryAutoAssigned && categoryId !== editTx.categoryId;
    const overriddenMerchant = wasAutoAssigned ? editTx.description : null;
    const overriddenCategoryName = wasAutoAssigned ? (editTx.categoryName ?? "that category") : null;

    // Detect whether this tx previously had a goal assignment (categoryId null = goal tx)
    const hadGoal = !editTx.categoryId;
    const nowHasGoal = !!goalContribution;
    const needsContribUpdate = nowHasGoal || hadGoal;

    setIsSaving(true);
    try {
      // Step 1: Update the transaction
      const patchRes = await fetch(`/api/transactions/${txId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          description: form.description,
          categoryId,
          date: form.date,
          paymentMethod: form.paymentMethod,
        }),
      });
      if (!patchRes.ok) return;

      // Show popup if user overrode an auto-assigned category
      if (wasAutoAssigned && overriddenMerchant && overriddenCategoryName) {
        setAutoRulePrompt({ merchantName: overriddenMerchant, oldCategoryName: overriddenCategoryName });
      }

      // Step 2: Manage contributions when goal assignment changes in either direction
      if (needsContribUpdate) {
        const contribsRes = await fetch(`/api/goal-contributions?month=${currentMonth}`, { credentials: "include" });
        const contribs: any[] = contribsRes.ok ? await contribsRes.json() : [];
        const linked = contribs.filter((c: any) => c.transactionId === txId);
        await Promise.all(linked.map((c: any) =>
          fetch(`/api/goal-contributions/${c.id}`, { method: "DELETE", credentials: "include" })
        ));

        if (goalContribution) {
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
      }

      invalidateAll(queryClient, currentMonth);
      setEditTx(null);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("tx.title")}</h1>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction" className="gap-2">
          <Plus className="w-4 h-4" /> {t("common.add")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search" placeholder={t("tx.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44" data-testid="select-filter-category"><SelectValue placeholder={t("tx.all_cats")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tx.all_cats")}</SelectItem>
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
          <p className="text-sm">{t("tx.no_results")}</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="divide-y divide-border">
            {filtered.map(tx => {
              const goalContrib = !tx.categoryId
                ? (allContribs ?? []).find((c: any) => c.transactionId === tx.id)
                : null;
              const displayName  = tx.categoryName ?? (goalContrib ? `${goalContrib.goalName} (${t("tx.goal")})` : t("common.uncategorized"));
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
                    <p className="text-xs text-muted-foreground">{displayName} · {getPaymentLabel()[tx.paymentMethod] ?? tx.paymentMethod}{tx.userName ? ` · ${tx.userName}` : ""}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{tx.date}</span>
                  {/* Amount — show original currency for locked rows */}
                  <span className="font-semibold text-sm w-20 text-right flex-shrink-0">
                    {tx.currencyLocked && tx.transactionCurrency
                      ? fmtAmt(Number(tx.amount), tx.transactionCurrency)
                      : fmtAmt(Number(tx.amount), loadPrefs().currency)}
                  </span>

                  {/* Foreign-currency chip */}
                  {tx.transactionCurrency && tx.transactionCurrency !== prefs.currency && !tx.currencyLocked && (
                    <button
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors"
                      title={t("currency.change_chip_title")}
                      onClick={() => setConvertTx(tx)}
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      {t("currency.change_chip")}
                    </button>
                  )}
                  {/* Locked-currency indicator */}
                  {tx.currencyLocked && tx.transactionCurrency && (
                    <span
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-400 bg-zinc-800/40"
                      title={t("currency.locked_in", { cur: tx.transactionCurrency })}
                    >
                      <Lock className="w-2.5 h-2.5" />
                      {tx.transactionCurrency}
                    </span>
                  )}

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
          <DialogHeader><DialogTitle>{t("tx.new_dialog")}</DialogTitle></DialogHeader>
          <TxForm initial={blank} categories={categories ?? []} goals={goals ?? []} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} loading={create.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("tx.edit_dialog")}</DialogTitle></DialogHeader>
          {editTx && (() => {
            // If this is a goal-assigned tx (categoryId null), find existing contribution
            // so the dropdown shows the current goal instead of "No category"
            const existingContrib = !editTx.categoryId
              ? (allContribs ?? []).find((c: any) => c.transactionId === editTx.id)
              : null;
            const initCategoryId = editTx.categoryId
              ? String(editTx.categoryId)
              : existingContrib ? `goal_${existingContrib.goalId}` : "none";
            return (
              <>
                <TxForm
                  initial={{ amount: String(editTx.amount), description: editTx.description, categoryId: initCategoryId, date: editTx.date, paymentMethod: editTx.paymentMethod }}
                  categories={categories ?? []}
                  goals={goals ?? []}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditTx(null)}
                  loading={isSaving}
                />
                <DedicateToGoalSection tx={editTx} goals={goals ?? []} />
              </>
            );
          })()}
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

      {/* Currency conversion dialog */}
      {convertTx && (
        <CurrencyConvertSheet
          tx={convertTx}
          accountCurrency={prefs.currency}
          onClose={() => setConvertTx(null)}
          onConverted={() => invalidateAll(queryClient, currentMonth)}
        />
      )}

      {/* Auto-category override popup */}
      {autoRulePrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm mx-4 mb-24 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4">
            <p className="text-sm font-medium text-white mb-1">{t("auto_cat.stop_title")}</p>
            <p className="text-xs text-zinc-400 mb-4">
              {t("auto_cat.tagged_msg", { merchant: autoRulePrompt.merchantName, category: autoRulePrompt.oldCategoryName })}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                onClick={() => setAutoRulePrompt(null)}
              >
                {t("auto_cat.keep")}
              </button>
              <button
                className="flex-1 py-2 rounded-xl bg-white text-sm text-black font-medium hover:bg-zinc-200 transition-colors"
                onClick={async () => {
                  const rules = await listMerchantCategoryRules();
                  const rule = rules.find(
                    r => r.merchantName === autoRulePrompt.merchantName.trim().toLowerCase(),
                  );
                  if (rule) updateMerchantRule.mutate({ id: rule.id, data: { disabled: true } });
                  setAutoRulePrompt(null);
                }}
              >
                {t("auto_cat.yes_stop")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
