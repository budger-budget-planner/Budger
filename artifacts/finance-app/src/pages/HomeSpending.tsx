import { useState, useRef } from "react";
import { t, fmtMonthYear, fmtDayDate } from "@/lib/i18n";
import { CurrencyConvertSheet } from "@/components/CurrencyConvertSheet";
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
  useUpdateMe,
  useUpdateMerchantCategoryRule,
  listMerchantCategoryRules,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSpendingHistoryQueryKey,
  getGetGoalsSummaryQueryKey,
  getListGoalContributionsQueryKey,
  getGetMeQueryKey,
  useGetMe,
  useListHouseholdMembers,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Camera, X, ZoomIn, ImageOff, Image, ChevronLeft, ChevronRight, Target, Search, RefreshCw, Lock, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { compressImage } from "@/lib/imageUtils";
import { loadPrefs, savePrefs, currencySymbol, fmtAmt } from "@/lib/prefs";

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
    <input
      type="text"
      placeholder="DD/MM/RRRR"
      value={display}
      onChange={handleChange}
      required={required}
      inputMode="numeric"
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
}

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
        <Label>{t("common.amount")}</Label>
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
        <Label>{t("home.description")}</Label>
        <Input
          data-testid="input-description"
          placeholder={t("home.coffee_placeholder")}
          value={form.description}
          onChange={e => set("description", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("home.category")}</Label>
        <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
          <SelectTrigger data-testid="select-category">
            <SelectValue placeholder={t("home.no_category")} />
          </SelectTrigger>
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
          </SelectContent>
        </Select>
      </div>

      {/* Goal toggle */}
      {goals.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("home.partially_goal")}</p>
              <p className="text-xs text-muted-foreground">{t("home.count_toward_goal")}</p>
            </div>
            <Switch
              checked={form.isGoalExpense}
              onCheckedChange={v => set("isGoalExpense", v)}
            />
          </div>

          {form.isGoalExpense && (
            <div className="space-y-3 pt-1 border-t border-border/60">
              <div className="space-y-1.5">
                <Label>{t("home.goal")}</Label>
                <Select value={form.goalId} onValueChange={v => set("goalId", v)} required={form.isGoalExpense}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("home.select_goal")} />
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
                <Label>{t("home.amount_toward_goal")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={form.amount || undefined}
                  placeholder={`${t("home.up_to")} ${form.amount || "0.00"}`}
                  value={form.goalAmount}
                  onChange={e => set("goalAmount", e.target.value)}
                  required={form.isGoalExpense}
                />
                {goalAmountError && (
                  <p className="text-xs text-destructive">{t("home.cannot_exceed")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("common.date")}</Label>
          <DdMmYyyyInput
            value={form.date}
            onChange={v => set("date", v)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("home.payment")}</Label>
          <Select value={form.paymentMethod} onValueChange={v => set("paymentMethod", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="card">{t("home.card")}</SelectItem>
              <SelectItem value="apple_pay">Apple Pay</SelectItem>
              <SelectItem value="cash">{t("home.cash")}</SelectItem>
              <SelectItem value="bank_transfer">{t("home.bank_transfer")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={loading || !!goalAmountError || (form.isGoalExpense && (!form.goalId || form.goalId === "none"))}
          data-testid="button-save-transaction"
        >
          {loading ? t("common.saving") : t("common.save")}
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
          <DialogHeader><DialogTitle>{t("home.receipt", { desc: tx.description })}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {fmtAmt(Number(tx.amount), tx.transactionCurrency ?? loadPrefs().currency)}
              </span>
              {" "}· {tx.categoryName ?? t("common.uncategorized")} · {tx.date}
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
                <p className="text-sm text-center">{t("home.no_receipt")}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2"
                onClick={() => cameraRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Camera className="w-4 h-4" />
                {uploadReceipt.isPending ? t("home.uploading") : t("home.camera")}
              </Button>
              <Button variant="outline" className="gap-2"
                onClick={() => libraryRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Image className="w-4 h-4" /> {t("home.library")}
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose}>{t("common.done")}</Button>
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

function SplitSheet({
  tx,
  members,
  myUserId,
  sym,
  issuerCurrency,
  onClose,
  onSuccess,
}: {
  tx: any;
  members: any[];
  myUserId: number;
  sym: string;
  issuerCurrency: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [recipientId, setRecipientId] = useState("");
  const [splitMode, setSplitMode] = useState<"amount" | "percent">("amount");
  const [splitValue, setSplitValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const txAmount = Number(tx.amount);
  const splitAmt = splitMode === "amount"
    ? parseFloat(splitValue) || 0
    : ((parseFloat(splitValue) || 0) / 100) * txAmount;

  const isValid = !!recipientId && splitAmt > 0 && splitAmt <= txAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/splits`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: tx.id, recipientId: parseInt(recipientId), splitAmount: splitAmt, issuerCurrency }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as any).error ?? t("split.request_sent"));
        return;
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  const others = members.filter((m: any) => m.userId !== myUserId);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] rounded-t-2xl px-5 pt-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 16px), 24px)" }}>
        <div className="flex justify-center pt-1 pb-3">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-3 mb-5">
          <GitFork className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">{t("split.title")}</p>
            <p className="text-xs text-muted-foreground truncate">{tx.description} · {sym}{txAmount.toFixed(2)}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>{t("split.member_label")}</Label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger><SelectValue placeholder={t("split.choose_member")} /></SelectTrigger>
              <SelectContent>
                {others.map((m: any) => (
                  <SelectItem key={m.userId} value={String(m.userId)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.memberColor ?? "#888" }} />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("split.amount_label")}</Label>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button type="button"
                  className={`px-3 py-1.5 transition-colors ${splitMode === "amount" ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
                  onClick={() => { setSplitMode("amount"); setSplitValue(""); }}>{sym}</button>
                <button type="button"
                  className={`px-3 py-1.5 transition-colors ${splitMode === "percent" ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
                  onClick={() => { setSplitMode("percent"); setSplitValue(""); }}>%</button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {splitMode === "amount" ? sym : "%"}
              </span>
              <Input type="number" min="0.01" step={splitMode === "amount" ? "0.01" : "1"}
                max={splitMode === "amount" ? txAmount : 100}
                placeholder="0" value={splitValue} onChange={e => setSplitValue(e.target.value)}
                className="pl-7" />
            </div>
            {splitValue && splitAmt > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("split.recipient_pays")}: {sym}{splitAmt.toFixed(2)} · {t("split.you_pay")}: {sym}{(txAmount - splitAmt).toFixed(2)}
              </p>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pb-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" className="flex-1" disabled={loading || !isValid}>
              {loading ? "…" : t("split.send_request")}
            </Button>
          </div>
        </form>
      </div>
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

  const [viewDate,     setViewDate]    = useState(new Date());
  const [addOpen,      setAddOpen]     = useState(false);
  const [editTx,       setEditTx]      = useState<any | null>(null);
  const [receiptTx,    setReceiptTx]   = useState<any | null>(null);
  const [actionTx,     setActionTx]    = useState<number | null>(null);
  const [convertTx,    setConvertTx]   = useState<any | null>(null);
  const [budgetOpen,   setBudgetOpen]  = useState(false);
  const [budgetInput,  setBudgetInput] = useState("");
  const [searchQuery,  setSearchQuery] = useState("");
  const [autoRulePrompt, setAutoRulePrompt] = useState<{ merchantName: string; oldCategoryName: string } | null>(null);
  const [splitTx, setSplitTx] = useState<any | null>(null);
  const [splitSent, setSplitSent] = useState(false);
  const updateMerchantRule = useUpdateMerchantCategoryRule();
  const { data: me } = useGetMe();
  const myUserId = (me as any)?.id;
  const isInHousehold = !!(me as any)?.householdId;
  const { data: householdMembers } = useListHouseholdMembers({ query: { enabled: isInHousehold } as any });

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
  const updateMe = useUpdateMe({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) } });

  const sorted = [...(transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  // Locked currency transactions are excluded from the main budget total (matches server summary logic)
  const isLockedForeign = (tx: any) =>
    tx.currencyLocked && tx.transactionCurrency && tx.transactionCurrency !== prefs.currency;

  const total = sorted
    .filter(tx => !tx.currencyLocked)
    .reduce((s, tx) => s + Number(tx.amount), 0);

  // Group locked-foreign amounts by their original currency for the separate display
  const lockedByCurrency: Record<string, number> = {};
  for (const tx of sorted) {
    if (isLockedForeign(tx)) {
      const cur = tx.transactionCurrency as string;
      lockedByCurrency[cur] = (lockedByCurrency[cur] ?? 0) + Number(tx.amount);
    }
  }
  const lockedEntries = Object.entries(lockedByCurrency);

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

    // Was this an auto-assigned category that the user is now overriding?
    const wasAutoAssigned = editTx.categoryAutoAssigned && categoryId !== editTx.categoryId;
    const overriddenMerchant = wasAutoAssigned ? editTx.description : null;
    const overriddenCategoryName = wasAutoAssigned ? (editTx.categoryName ?? "that category") : null;

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
          if (wasAutoAssigned && overriddenMerchant && overriddenCategoryName) {
            setAutoRulePrompt({ merchantName: overriddenMerchant, oldCategoryName: overriddenCategoryName });
          }
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
    // Persist to server so budget survives device switches and stays per-user
    updateMe.mutate({ data: { totalBudget: val } });
  }

  const q = searchQuery.trim().toLowerCase();

  function matchesDateQuery(raw: string, isoDate: string): boolean {
    const normalised = raw.replace(/\//g, ".");
    const parts = normalised.split(".");
    if (parts.length === 3 && parts[2].length === 4) {
      const [dd, mm, yyyy] = parts;
      return isoDate === `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    if (parts.length === 2) {
      if (parts[1].length === 4) {
        const [mm, yyyy] = parts;
        return isoDate.startsWith(`${yyyy}-${mm.padStart(2, "0")}`);
      }
      const [dd, mm] = parts;
      if (dd && mm) {
        return isoDate.endsWith(`-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
      }
    }
    return false;
  }

  const filtered = q
    ? sorted.filter(tx =>
        tx.description.toLowerCase().includes(q) ||
        (tx.categoryName ?? "").toLowerCase().includes(q) ||
        String(tx.amount).includes(q) ||
        tx.date.includes(q) ||
        matchesDateQuery(q, tx.date)
      )
    : sorted;

  const grouped: Record<string, typeof sorted> = {};
  for (const tx of filtered) {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Unified summary card ── */}
      <div className="px-5 pt-4 pb-0">
        <div className="rounded-2xl bg-card border border-border px-5 py-4 space-y-3">
          {totalBudget == null ? (
            <>
              {/* No budget: CTA row */}
              <button
                onClick={() => { setBudgetInput(""); setBudgetOpen(true); }}
                className="w-full flex items-center gap-3 py-1 text-left transition active:opacity-70"
                data-testid="button-set-budget"
              >
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 text-white/50" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("home.set_budget")}</p>
                  <p className="text-xs text-white/40">{t("home.track_how_close")}</p>
                </div>
                <Plus className="w-4 h-4 text-white/30 flex-shrink-0" />
              </button>
              {/* Divider */}
              <div className="border-t border-border" />
              {/* Stats row */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t("home.total_spent")}</p>
                  <p className="text-3xl font-bold">{fmtAmt(total, prefs.currency)}</p>
                  {lockedEntries.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      +{lockedEntries.map(([cur, amt]) => fmtAmt(amt, cur)).join(", ")} {t("home.not_converted")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t("home.entries")}</p>
                  <p className="text-3xl font-bold">{sorted.length}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Budget headline */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("home.monthly_budget")}</p>
                <button
                  className="text-xs text-white/40 hover:text-white/70 transition"
                  onClick={() => { setBudgetInput(String(totalBudget)); setBudgetOpen(true); }}
                >
                  {t("common.edit")}
                </button>
              </div>
              <p className="text-3xl font-bold leading-tight">{fmtAmt(totalBudget, prefs.currency)}</p>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Spent + entries row */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t("home.total_spent")}</p>
                  <p className="text-2xl font-bold">{fmtAmt(total, prefs.currency)}</p>
                  {lockedEntries.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      +{lockedEntries.map(([cur, amt]) => fmtAmt(amt, cur)).join(", ")} {t("home.not_converted")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t("home.entries")}</p>
                  <p className="text-2xl font-bold">{sorted.length}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${budgetPct}%`, backgroundColor: total > totalBudget ? "#f87171" : "#818cf8" }}
                  />
                </div>
                <p className={`text-xs ${remaining != null && remaining < 0 ? "text-red-400" : "text-white/40"}`}>
                  {remaining != null && remaining >= 0
                    ? prefs.language === "pl"
                      ? `${t("common.remaining")} ${fmtAmt(remaining, prefs.currency)}`
                      : `${fmtAmt(remaining, prefs.currency)} ${t("common.remaining")}`
                    : remaining != null
                      ? `${fmtAmt(-remaining, prefs.currency)} ${t("common.over_budget")}`
                      : ""}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Month navigation ── */}
      <div className="px-5 pt-3 pb-0">
        <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-3 py-2.5">
          <button onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-muted">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{fmtMonthYear(viewDate)}</p>
            {isCurrentMonth && <p className="text-[10px] text-muted-foreground">{t("home.current_month")}</p>}
          </div>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            disabled={isCurrentMonth}
            className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-muted disabled:opacity-30">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* ── Search bar ── */}
      {sorted.length > 0 && (
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setActionTx(null); }}
              placeholder={t("home.search_placeholder")}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Transaction list ── */}
      <div className="flex-1 px-5 space-y-5 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <p className="text-sm">{t("home.no_spending_month")}</p>
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> {t("home.add_first_entry")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Search className="w-8 h-8 opacity-30" />
            <p className="text-sm">{t("home.search_no_results")}</p>
          </div>
        ) : (
          dates.map(date => (
            <div key={date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {fmtDayDate(date)}
              </p>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {grouped[date].map(tx => {
                  const contrib = contribByTxId.get(tx.id);
                  const dotColor = tx.categoryColor ?? "#666";
                  const categoryLabel = tx.categoryName ?? t("common.uncategorized");

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
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                            {(tx as any).splitRole && (
                              <span
                                title={(tx as any).splitRole === "issuer" ? t("split.issued_icon") : t("split.received_icon")}
                                className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-zinc-600 bg-zinc-800/40 text-[10px] font-medium text-zinc-400"
                              >
                                <GitFork className="w-2 h-2" />
                                {t("split.btn")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {categoryLabel}
                            {tx.receiptImage ? " · 📎" : ""}
                            {contrib && (
                              <span
                                className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium"
                                style={{ backgroundColor: contrib.color + "22", borderColor: contrib.color + "66", color: contrib.color }}
                              >
                                <Target className="w-2 h-2 flex-shrink-0" />
                                {contrib.name} {fmtAmt(contrib.amount, prefs.currency)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">
                            −{fmtAmt(Number(tx.amount), tx.transactionCurrency ?? prefs.currency)}
                          </p>
                          {(tx as any).splitRole === "issuer" && (tx as any).preSplitAmount != null && (
                            <p className="text-[10px] text-muted-foreground/50 leading-tight">
                              {fmtAmt((tx as any).preSplitAmount, tx.transactionCurrency ?? prefs.currency)} {t("split.before_split")}
                            </p>
                          )}
                          {/* Foreign-currency chips */}
                          {tx.transactionCurrency && tx.transactionCurrency !== prefs.currency && !tx.currencyLocked && (
                            <button
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 active:bg-yellow-500/20"
                              onClick={e => { e.stopPropagation(); setConvertTx(tx); setActionTx(null); }}
                            >
                              <RefreshCw className="w-2 h-2" />
                              zmień walutę
                            </button>
                          )}
                          {tx.currencyLocked && tx.transactionCurrency && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-zinc-600 text-zinc-400 bg-zinc-800/40">
                              <Lock className="w-2 h-2" />
                              {tx.transactionCurrency}
                            </span>
                          )}
                        </div>
                      </div>

                      {actionTx === tx.id && (
                        <div className="flex gap-2 px-3 pb-3 flex-wrap">
                          <button onClick={() => { setReceiptTx(tx); setActionTx(null); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                            <Camera className="w-3.5 h-3.5" /> {t("home.receipt_btn")}
                          </button>
                          <button onClick={() => { setEditTx(tx); setActionTx(null); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                            <Pencil className="w-3.5 h-3.5" /> {t("home.edit_btn")}
                          </button>
                          {isInHousehold && tx.userId === myUserId && !(tx as any).splitRole && (
                            <button onClick={() => { setSplitTx(tx); setActionTx(null); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                              <GitFork className="w-3.5 h-3.5" /> {t("split.btn")}
                            </button>
                          )}
                          <button
                            onClick={() => remove.mutate({ id: tx.id })}
                            disabled={remove.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70 disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
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
          <DialogHeader><DialogTitle>{t("home.new_tx")}</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>{t("home.edit_tx_title")}</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>{t("home.monthly_budget")}</DialogTitle></DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              saveTotalBudget(budgetInput ? parseFloat(budgetInput) : null);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>{t("home.total_budget_label")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
                <Input
                  data-testid="input-total-budget"
                  type="number"
                  min="0"
                  step="1"
                  placeholder={t("home.budget_eg")}
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("home.budget_cap_desc")}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setBudgetOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1">{t("common.save")}</Button>
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
      {/* Currency conversion dialog */}
      {convertTx && (
        <CurrencyConvertSheet
          tx={convertTx}
          accountCurrency={prefs.currency}
          onClose={() => setConvertTx(null)}
          onConverted={() => invalidateAll(queryClient)}
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

      {/* ── Split sheet ── */}
      {splitTx && (
        <SplitSheet
          tx={splitTx}
          members={(householdMembers as any[]) ?? []}
          myUserId={myUserId}
          sym={sym}
          issuerCurrency={prefs.currency}
          onClose={() => setSplitTx(null)}
          onSuccess={() => {
            setSplitTx(null);
            setSplitSent(true);
            setTimeout(() => setSplitSent(false), 3000);
          }}
        />
      )}

      {/* ── Split sent toast ── */}
      {splitSent && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-4">
            <GitFork className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">{t("split.request_sent")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
