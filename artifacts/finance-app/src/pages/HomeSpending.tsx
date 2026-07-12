import { useState, useRef, useEffect } from "react";
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
  getListGoalsQueryKey,
  useListRecurringPayments,
  getListRecurringPaymentsQueryKey,
  useGetLarder,
  getGetLarderQueryKey,
  useDeleteLarderEntry,
  useGetGoalsSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutationWithQueue } from "@/hooks/useMutationWithQueue";
import { useOfflinePendingOps } from "@/hooks/useOfflinePendingOps";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Plus, Pencil, Trash2, Camera, X, ZoomIn, ImageOff, ChevronLeft, ChevronRight, Target, Search, RefreshCw, Lock, Scissors, AlertTriangle, CheckCircle, Warehouse, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { receiptSrc, compressImage } from "@/lib/imageUtils";
import { ReceiptImg } from "@/components/ReceiptImg";
import { loadPrefs, savePrefs, currencySymbol, fmtAmt, peekSwipeHintDue, markSwipeHintSeen } from "@/lib/prefs";
import { useAppReady } from "@/lib/appReady";
import { fetchRates, convertAmount } from "@/lib/rates";

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
  goalMode: "off" | "all" | "part";
  goalId: string;
  goalAmount: string;
  foundedWithRealizedGoal: boolean;
};

function TxForm({ initial, categories, goals, goalSummaries, onSubmit, onCancel, loading }: {
  initial: TxFormState;
  categories: any[];
  goals: any[];
  goalSummaries: any[];
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
  const goalAmountError = form.goalMode === "part" && !!form.goalAmount && goalAmountNum > txAmount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.goalMode !== "off" && (!form.goalId || form.goalId === "none")) return;
    if (goalAmountError) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("common.amount")}</Label>
        <Input
          data-testid="input-amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={form.amount}
          onChange={e => {
            const v = e.target.value;
            if (v === "" || /^\d*\.?\d*$/.test(v)) set("amount", v);
          }}
          onBlur={() => {
            const n = parseFloat(form.amount);
            if (!isNaN(n)) set("amount", n.toFixed(2));
          }}
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
          className="border-zinc-500/50 focus-visible:ring-zinc-500/50"
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

      <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t("tx.founded_with_realized_goal")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("tx.founded_with_realized_goal_hint")}</p>
        </div>
        <Switch
          checked={form.foundedWithRealizedGoal}
          onCheckedChange={v => set("foundedWithRealizedGoal", v)}
        />
      </div>

      {/* Goal toggle */}
      {goals.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{t("home.dedicate_to_goal")}</p>
            {/* 3-position pill: Off / All / Part */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs flex-shrink-0">
              {(["off", "all", "part"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    set("goalMode", mode);
                    if (mode === "off") { set("goalId", "none"); set("goalAmount", ""); }
                  }}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    form.goalMode === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`home.goal_mode_${mode}` as any)}
                </button>
              ))}
            </div>
          </div>

          {form.goalMode !== "off" && (
            <div className="space-y-3 pt-1 border-t border-border/60">
              {form.goalMode === "all" && (
                <p className="text-xs text-muted-foreground">{t("home.goal_all_desc")}</p>
              )}
              {form.goalMode === "part" && (
                <p className="text-xs text-muted-foreground">{t("home.goal_part_desc")}</p>
              )}
              <div className="space-y-1.5">
                <Label>{t("home.goal")}</Label>
                <Select value={form.goalId} onValueChange={v => set("goalId", v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder={t("home.select_goal")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="larder">
                      <span className="flex items-center gap-2">
                        {/* 4-point diamond spark — matches the gem-flash animation shape */}
                        <svg viewBox="0 0 12 12" width="12" height="12" className="flex-shrink-0" fill="currentColor" aria-hidden="true">
                          <polygon points="6,0 7,5 12,6 7,7 6,12 5,7 0,6 5,5" />
                        </svg>
                        {t("larder.tab")}
                      </span>
                    </SelectItem>
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
                {/* Goal remaining preview */}
                {form.goalId && form.goalId !== "none" && form.goalId !== "larder" && (() => {
                  const summary = goalSummaries.find((s: any) => String(s.goalId) === form.goalId);
                  if (!summary) return null;
                  const remaining = summary.budget - summary.contributed;
                  const goalObj = goals.find((g: any) => String(g.id) === form.goalId);
                  const currency = goalObj?.currency ?? loadPrefs().currency;
                  if (remaining <= 0) return (
                    <p className="text-xs text-emerald-500">{t("home.goal_completed")}</p>
                  );
                  return (
                    <p className="text-xs text-muted-foreground">{t("home.goal_remaining", { amt: fmtAmt(remaining, currency) })}</p>
                  );
                })()}
              </div>

              {form.goalMode === "part" && (
                <div className="space-y-1.5">
                  <Label>{t("home.amount_toward_goal")}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={`${t("home.up_to")} ${form.amount || "0.00"}`}
                    value={form.goalAmount}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) set("goalAmount", v);
                    }}
                    onBlur={() => {
                      const n = parseFloat(form.goalAmount);
                      if (!isNaN(n)) set("goalAmount", n.toFixed(2));
                    }}
                    required={form.goalMode === "part"}
                  />
                  {goalAmountError && (
                    <p className="text-xs text-destructive">{t("home.cannot_exceed")}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t("common.date")}</Label>
        <DdMmYyyyInput
          value={form.date}
          onChange={v => set("date", v)}
          required
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button
          type="submit"
          className="flex-1 bg-zinc-500/10 border border-zinc-500/40 text-foreground hover:bg-zinc-500/20"
          disabled={loading || !!goalAmountError || (form.goalMode !== "off" && (!form.goalId || form.goalId === "none")) || (form.goalMode === "part" && !form.goalAmount)}
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
  const libraryRef   = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);
  // Holds the receipt image immediately after a successful upload/delete so
  // the preview updates at once without waiting for the query refetch.
  // `undefined` = no local override yet (use tx.receiptImage); `null` =
  // explicitly cleared (removed). Using `null` for "no override" would make
  // `localReceiptImage ?? tx.receiptImage` fall through to the stale server
  // value right after a delete, since `??` treats null the same as unset.
  const [localReceiptImage, setLocalReceiptImage] = useState<string | null | undefined>(undefined);

  // Reset local state whenever the dialog closes or the transaction changes.
  useEffect(() => {
    if (!open) setLocalReceiptImage(undefined);
  }, [open]);

  // The effective receipt image: prefer the freshly-uploaded/deleted local
  // override over the (potentially stale) server-fetched version.
  const effectiveReceiptImage = localReceiptImage !== undefined ? localReceiptImage : (tx.receiptImage ?? null);

  const uploadReceipt = useUploadReceipt({ mutation: { onSuccess: (data: any) => {
    // Show the image immediately from the server response instead of a
    // client-derived path — the upload endpoint may resolve/rewrite the
    // stored value, so the response is the only value guaranteed to be
    // servable right away.
    if (data?.receiptImage) setLocalReceiptImage(data.receiptImage);
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});
  const deleteReceipt = useDeleteReceipt({ mutation: { onSuccess: () => {
    setLocalReceiptImage(null);
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      let dataUrl: string;
      try {
        // Compress to 800 px / 65 % quality → keeps uploads under ~300 KB.
        dataUrl = await compressImage(file, 800, 0.65);
      } catch {
        // Canvas can fail on iOS for HEIC/HEIF or under memory pressure.
        // Fall back to reading the raw file as a base64 data URL.
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("FileReader failed"));
          reader.readAsDataURL(file);
        });
      }
      uploadReceipt.mutate({ id: tx.id, data: { imageData: dataUrl } });
    } catch {
      alert(t("tx.image_error"));
    }
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
              {" "}· {tx.categoryName ?? (!(tx as any).categoryId && (tx as any).recurringPaymentId ? t("tx.recurring_payment") : t("common.uncategorized"))} · {tx.date}
            </div>
            {effectiveReceiptImage ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <ReceiptImg src={receiptSrc(effectiveReceiptImage)!} alt="Receipt"
                  className="w-full object-cover max-h-64 cursor-pointer"
                  onClick={() => setLightbox(true)} />
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
            {effectiveReceiptImage && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setLightbox(true)}>
                  <ZoomIn className="w-4 h-4" /> View
                </Button>
                <Button variant="ghost" className="gap-2 bg-destructive/10 text-destructive"
                  onClick={() => deleteReceipt.mutate({ id: tx.id })}
                  disabled={deleteReceipt.isPending}>
                  <Trash2 className="w-4 h-4" /> Remove
                </Button>
              </div>
            )}
            <Button variant="outline" className="w-full gap-2"
              onClick={() => libraryRef.current?.click()} disabled={uploadReceipt.isPending}>
              <Plus className="w-4 h-4" />
              {uploadReceipt.isPending ? t("home.uploading") : effectiveReceiptImage ? t("home.replace_photo") : t("home.add_photo")}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>{t("common.done")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && effectiveReceiptImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(false)}>
            <X className="w-6 h-6" />
          </button>
          <ReceiptImg src={receiptSrc(effectiveReceiptImage)!} alt="Receipt full size"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

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
  goalContrib,
  rates,
  onClose,
  onSuccess,
}: {
  tx: any;
  members: any[];
  myUserId: number;
  sym: string;
  issuerCurrency: string;
  goalContrib?: { name: string; amount: number; currency?: string | null; accountAmount?: number | null; accountCurrency?: string | null } | null;
  rates: Record<string, number> | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [splitMode, setSplitMode] = useState<"amount" | "percent">("amount");
  const [values, setValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const txAmount = Number(tx.amount);

  // For locked or foreign-currency transactions, show amounts in the transaction's
  // own currency, not the account currency.
  const effectiveSym = tx.transactionCurrency ? currencySymbol(tx.transactionCurrency) : sym;

  const others = members.filter((m: any) => m.userId !== myUserId);
  const checkedIds = others.filter((m: any) => checked[m.userId]).map((m: any) => m.userId);

  // Resolve each checked member's entered amount/percent into a currency amount
  // in the transaction's own currency, so the totals below and the submit
  // payload are always expressed the same way regardless of the active mode.
  function amountFor(userId: number): number {
    const raw = parseFloat(values[userId] ?? "") || 0;
    return splitMode === "amount" ? raw : (raw / 100) * txAmount;
  }

  const lines = checkedIds
    .map((id: number) => ({ recipientId: id, amount: amountFor(id) }))
    .filter(l => l.amount > 0);
  const totalSplitAmount = lines.reduce((acc, l) => acc + l.amount, 0);
  const yourRemaining = txAmount - totalSplitAmount;

  // Amount dedicated to the goal, expressed in the transaction's own currency
  // (issuerCurrency). Prefer the stored accountAmount/accountCurrency snapshot
  // taken at contribution-time — it matches exactly what the backend uses to
  // block the split. For legacy contributions without that snapshot (or any
  // other currency mismatch), convert using live rates instead of skipping —
  // mirrors the backend's fallback so the client warning matches the block.
  const goalAmountInTxCurrency = (() => {
    if (!goalContrib) return 0;
    if (goalContrib.accountAmount != null && goalContrib.accountCurrency != null) {
      return goalContrib.accountCurrency === issuerCurrency
        ? goalContrib.accountAmount
        : convertAmount(goalContrib.accountAmount, goalContrib.accountCurrency, issuerCurrency, rates ?? {});
    }
    const contribCurrency = goalContrib.currency ?? issuerCurrency;
    return contribCurrency === issuerCurrency
      ? goalContrib.amount
      : convertAmount(goalContrib.amount, contribCurrency, issuerCurrency, rates ?? {});
  })();

  const sumExceedsTotal = totalSplitAmount > txAmount + 0.01;

  // Block split if it would leave less than the goal-dedicated amount on this transaction
  const wouldViolateGoal = !!(
    goalAmountInTxCurrency > 0 && totalSplitAmount > 0 && yourRemaining < goalAmountInTxCurrency
  );

  const isValid = lines.length > 0 && !sumExceedsTotal && !wouldViolateGoal;

  function toggleMember(userId: number) {
    setChecked(prev => ({ ...prev, [userId]: !prev[userId] }));
  }

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
        body: JSON.stringify({ transactionId: tx.id, issuerCurrency, splits: lines }),
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

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] rounded-t-2xl px-5 pt-4 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 16px), 24px)" }}>
        <div className="flex justify-center pt-1 pb-3">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-3 mb-5">
          <Scissors className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">{t("split.title")}</p>
            <p className="text-xs text-muted-foreground truncate">{tx.description} · {effectiveSym}{txAmount.toFixed(2)}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("split.select_members")}</Label>
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button type="button"
                  className={`px-3 py-1.5 transition-colors ${splitMode === "amount" ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
                  onClick={() => setSplitMode("amount")}>{effectiveSym}</button>
                <button type="button"
                  className={`px-3 py-1.5 transition-colors ${splitMode === "percent" ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
                  onClick={() => setSplitMode("percent")}>%</button>
              </div>
            </div>

            {others.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">{t("split.no_members")}</p>
            )}

            <div className="space-y-2">
              {others.map((m: any) => {
                const isChecked = !!checked[m.userId];
                const rawValue = values[m.userId] ?? "";
                const previewAmount = amountFor(m.userId);
                return (
                  <div key={m.userId} className={`rounded-xl border transition-colors ${isChecked ? "border-white/20 bg-white/5" : "border-border"}`}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleMember(m.userId)}
                        className="w-4 h-4 rounded accent-white flex-shrink-0" />
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.memberColor ?? "#888" }} />
                      <span className="text-sm flex-1 truncate">{m.name}</span>
                      {isChecked && (
                        <div className="w-28 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                              {splitMode === "amount" ? effectiveSym : "%"}
                            </span>
                            <Input type="number" min="0" step={splitMode === "amount" ? "0.01" : "1"}
                              placeholder="0" value={rawValue}
                              onChange={e => setValues(prev => ({ ...prev, [m.userId]: e.target.value }))}
                              className="pl-6 h-8 text-sm" />
                          </div>
                        </div>
                      )}
                    </label>
                    {isChecked && splitMode === "percent" && rawValue !== "" && (
                      <p className="text-[11px] text-muted-foreground text-right px-3 pb-2 -mt-1">
                        ≈ {effectiveSym}{previewAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {lines.length > 0 && (
              <div className="flex items-center justify-between pt-1 px-1">
                <span className="text-xs text-muted-foreground">{t("split.your_share")}</span>
                <span className={`text-sm font-medium ${yourRemaining < 0 ? "text-destructive" : ""}`}>
                  {effectiveSym}{yourRemaining.toFixed(2)}
                </span>
              </div>
            )}

            {sumExceedsTotal && (
              <p className="text-xs text-destructive">{t("split.sum_exceeds")}</p>
            )}

            {wouldViolateGoal && goalContrib && (
              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-400">
                  {t("split.goal_block", {
                    rem: `${effectiveSym}${yourRemaining.toFixed(2)}`,
                    goal: `${effectiveSym}${goalAmountInTxCurrency.toFixed(2)}`,
                  })}
                </p>
              </div>
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
  // Invalidate ALL goal-related queries so progress bars stay accurate
  // after any transaction create / update / delete.
  qc.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getListGoalContributionsQueryKey() });
  qc.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  qc.invalidateQueries({ queryKey: ["member-goal-contributions"] });
  // Recurring payments: re-evaluate appliedThisMonth after any tx change
  qc.invalidateQueries({ queryKey: getListRecurringPaymentsQueryKey() });
  // Larder: manual recurring-payment apply with "Add to Larder" credits the Larder
  qc.invalidateQueries({ queryKey: getGetLarderQueryKey() });
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
  goals: any[];
  userCurrency: string;
}) {
  const { txId, txDate, isGoalExpense, goalId, goalAmount, existingContribId, queryClient, viewMonth, goals, userCurrency } = opts;
  const isLarder = goalId === "larder";

  // Find and delete ALL contributions for this transaction across every month.
  // Searching by transactionId avoids missing contributions from past months
  // when the caller's viewMonth doesn't match the transaction's date month.
  const linkedRes = await fetch(`/api/goal-contributions?transactionId=${txId}`, { credentials: "include" });
  const linkedContribs: any[] = linkedRes.ok ? await linkedRes.json() : [];
  const idsToDelete = new Set<number>(linkedContribs.map((c: any) => c.id));
  if (existingContribId != null && !isLarder) idsToDelete.add(existingContribId);
  await Promise.all([...idsToDelete].map(id =>
    fetch(`/api/goal-contributions/${id}`, { method: "DELETE", credentials: "include" }),
  ));

  // Find and delete any prior Larder entry created by dedicating this transaction
  // straight to the Larder, so switching selections doesn't leave stale entries.
  const larderRes = await fetch("/api/larder", { credentials: "include" });
  const larderData = larderRes.ok ? await larderRes.json() : { entries: [] };
  const priorLarderEntries: any[] = (larderData.entries ?? []).filter(
    (e: any) => e.sourceType === "transaction_dedication" && e.sourceId === txId,
  );
  await Promise.all(priorLarderEntries.map(e =>
    fetch(`/api/larder/entries/${e.id}`, { method: "DELETE", credentials: "include" }),
  ));

  if (isGoalExpense && isLarder && parseFloat(goalAmount) > 0) {
    await fetch("/api/larder/entries", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(goalAmount),
        currency: userCurrency,
        sourceType: "transaction_dedication",
        sourceId: txId,
      }),
    });
  } else if (isGoalExpense && goalId && goalId !== "none" && parseFloat(goalAmount) > 0) {
    // Create new contribution, converted to goal's base currency.
    // We also store accountAmount/accountCurrency (the pre-conversion user-currency amount)
    // so that split validation can compare amounts in the same currency as the transaction.
    const month = dateToMonth(txDate);
    const goal = goals.find((g: any) => String(g.id) === String(goalId));
    const goalCurrency: string = (goal as any)?.currency ?? userCurrency;
    const accountAmt = parseFloat(goalAmount);
    let contribAmount = accountAmt;
    if (goalCurrency !== userCurrency) {
      try {
        const rates = await fetchRates();
        contribAmount = convertAmount(accountAmt, userCurrency, goalCurrency, rates);
      } catch { /* keep unconverted if fetch fails */ }
    }
    await fetch("/api/goal-contributions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId: parseInt(goalId),
        transactionId: txId,
        amount: contribAmount,
        currency: goalCurrency,
        accountAmount: accountAmt,
        accountCurrency: userCurrency,
        month,
      }),
    });
  }

  queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: viewMonth }) });
  queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  queryClient.invalidateQueries({ queryKey: ["member-goal-contributions"] });
  queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });
}

function SwipeableTxRow({
  txId,
  canSplit,
  onReceipt,
  onEdit,
  onSplit,
  onDelete,
  showHint,
  isOffline,
  children,
}: {
  txId: number;
  canSplit: boolean;
  onReceipt: () => void;
  onEdit: () => void;
  onSplit: () => void;
  onDelete: () => void;
  showHint?: boolean;
  isOffline?: boolean;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!showHint) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const go = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(id);
    };
    go(() => setAnimating(true), 0);
    go(() => setOffset(-7.5), 100);          // left ×1 (half)
    go(() => setOffset(0),    260);          // back
    go(() => setOffset(-15),  370);          // left ×2 (full)
    go(() => setOffset(0),    530);          // back
    go(() => setOffset(9.5),  1360);         // right ×1 (half)
    go(() => setOffset(0),    1520);         // back
    go(() => setOffset(19),   1630);         // right ×2 (full)
    go(() => setOffset(0),    1790);         // back
    go(() => setAnimating(false), 1900);
    return () => { cancelled = true; timers.forEach(clearTimeout); setOffset(0); setAnimating(false); };
  }, [showHint]);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const snappedRef = useRef<"left" | "right" | null>(null);
  const isDragging = useRef(false);
  const isScrolling = useRef<boolean | null>(null);
  const hasMoved = useRef(false);
  const swipeHandled = useRef(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Snap widths: how wide each panel is at rest after revealing
  const RIGHT_SNAP = canSplit ? 160 : 88;
  const LEFT_SNAP  = 160;
  const ACTION_THRESHOLD = 230;
  const SNAP_THRESHOLD   = 44;

  function snapTo(to: number, side: "left" | "right" | null) {
    setAnimating(true);
    setOffset(to);
    snappedRef.current = side;
    currentOffset.current = to;
    setTimeout(() => setAnimating(false), 340);
  }

  function resetRow() { snapTo(0, null); }

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail.id;
      if (id !== txId && snappedRef.current !== null) snapTo(0, null);
    };
    window.addEventListener("tx-swipe-open", handler);
    return () => window.removeEventListener("tx-swipe-open", handler);
  }, [txId]);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    isScrolling.current = null;
    hasMoved.current = false;
    setAnimating(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (isScrolling.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isScrolling.current = Math.abs(dy) > Math.abs(dx);
    }
    if (isScrolling.current === null || isScrolling.current) return;

    hasMoved.current = true;

    const base = snappedRef.current === "left"  ? -RIGHT_SNAP :
                 snappedRef.current === "right" ? LEFT_SNAP   : 0;
    let neo = base + dx;
    // Hard cap a little past action threshold so there's a visible elastic feel
    const cap = ACTION_THRESHOLD + 30;
    if (neo < -cap) neo = -cap;
    if (neo > cap)  neo = cap;
    setOffset(neo);
    currentOffset.current = neo;
  }

  function onTouchEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (!hasMoved.current || isScrolling.current) return;

    swipeHandled.current = true;
    setTimeout(() => { swipeHandled.current = false; }, 400);

    const off = currentOffset.current;

    if (isOffline) { snapTo(0, null); return; }

    if (off < -ACTION_THRESHOLD) {
      // Full left extend → delete: animate off-screen immediately and fire onDelete
      // right away. No snapTo — the row stays hidden until the parent unmounts it,
      // so there is no visible snap-back before the list item disappears.
      setAnimating(true);
      setOffset(-window.innerWidth);
      onDelete();
    } else if (off > ACTION_THRESHOLD) {
      // Full right extend → edit
      setAnimating(true);
      setOffset(window.innerWidth);
      setTimeout(() => { onEdit(); snapTo(0, null); }, 300);
    } else if (snappedRef.current === "left" && off > -(RIGHT_SNAP - SNAP_THRESHOLD)) {
      // Was showing right panel, user swiped back → close
      snapTo(0, null);
    } else if (snappedRef.current === "right" && off < LEFT_SNAP - SNAP_THRESHOLD) {
      // Was showing left panel, user swiped back → close
      snapTo(0, null);
    } else if (off < -SNAP_THRESHOLD && snappedRef.current !== "left") {
      snapTo(-RIGHT_SNAP, "left");
      window.dispatchEvent(new CustomEvent("tx-swipe-open", { detail: { id: txId } }));
    } else if (off > SNAP_THRESHOLD && snappedRef.current !== "right") {
      snapTo(LEFT_SNAP, "right");
      window.dispatchEvent(new CustomEvent("tx-swipe-open", { detail: { id: txId } }));
    } else {
      // Spring back to current snap
      if (snappedRef.current === "left")  snapTo(-RIGHT_SNAP, "left");
      else if (snappedRef.current === "right") snapTo(LEFT_SNAP, "right");
      else snapTo(0, null);
    }
  }

  function onClickCapture(e: React.MouseEvent) {
    if (swipeHandled.current) { e.stopPropagation(); return; }
    if (snappedRef.current) {
      const t = e.target as Node;
      const onPanel = leftPanelRef.current?.contains(t) || rightPanelRef.current?.contains(t);
      if (!onPanel) { e.stopPropagation(); resetRow(); }
    }
  }

  // Panel widths track exactly how much is exposed
  const rightPanelWidth = Math.max(0, -offset);
  const leftPanelWidth  = Math.max(0,  offset);

  // Extension ratios: 0 at snap, 1 at action threshold
  const rightExtend = rightPanelWidth > RIGHT_SNAP
    ? Math.min(1, (rightPanelWidth - RIGHT_SNAP) / Math.max(1, ACTION_THRESHOLD - RIGHT_SNAP))
    : 0;
  const leftExtend = leftPanelWidth > LEFT_SNAP
    ? Math.min(1, (leftPanelWidth - LEFT_SNAP) / Math.max(1, ACTION_THRESHOLD - LEFT_SNAP))
    : 0;

  // RIGHT panel section widths
  const splitSnapW  = canSplit ? RIGHT_SNAP / 2 : 0;
  const deleteSnapW = canSplit ? RIGHT_SNAP / 2 : RIGHT_SNAP;
  // Split section shrinks to 0 during extension; Delete section fills the rest
  const splitSectionW  = splitSnapW  * (1 - rightExtend);
  const deleteSectionW = rightPanelWidth - splitSectionW;

  // LEFT panel section widths
  const receiptSnapW  = LEFT_SNAP / 2;
  // Receipt section shrinks to 0 during extension; Edit section fills the rest
  const receiptSectionW = receiptSnapW * (1 - leftExtend);
  const editSectionW    = leftPanelWidth - receiptSectionW;

  return (
    <div className="relative overflow-hidden" onClickCapture={onClickCapture}>

      {/* ── LEFT panel: only visible when swiping right ── */}
      {leftPanelWidth > 0 && (
        <div
          ref={leftPanelRef}
          className="absolute inset-y-0 left-0 flex bg-zinc-800 overflow-hidden"
          style={{ width: leftPanelWidth }}
        >
          {/* Receipt section — shrinks and fades during extension */}
          {receiptSectionW > 0 && (
            <div
              className="flex flex-col items-center justify-center gap-1.5 text-white overflow-hidden flex-shrink-0 cursor-pointer active:brightness-75"
              style={{ width: receiptSectionW, opacity: 1 - leftExtend }}
              onClick={() => { if (!isOffline) { onReceipt(); resetRow(); } else resetRow(); }}
            >
              <Camera className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] font-semibold whitespace-nowrap">{t("home.receipt_btn")}</span>
            </div>
          )}
          {/* Edit section — expands to fill during extension, icon stays centred */}
          <div
            className="flex flex-col items-center justify-center gap-1.5 text-white cursor-pointer active:brightness-75 overflow-hidden"
            style={{ width: editSectionW, minWidth: deleteSnapW }}
            onClick={() => { if (!isOffline) { onEdit(); resetRow(); } else resetRow(); }}
          >
            <Pencil className="w-4 h-4 flex-shrink-0" />
            <span className="text-[10px] font-semibold whitespace-nowrap">{t("home.edit_btn")}</span>
          </div>
        </div>
      )}

      {/* ── RIGHT panel: only visible when swiping left ── */}
      {rightPanelWidth > 0 && (
        <div
          ref={rightPanelRef}
          className="absolute inset-y-0 right-0 flex overflow-hidden"
          style={{ width: rightPanelWidth }}
        >
          {/* Split section — shrinks and fades during extension */}
          {canSplit && splitSectionW > 0 && (
            <div
              className="flex flex-col items-center justify-center gap-1.5 text-white bg-zinc-800 overflow-hidden flex-shrink-0 cursor-pointer active:brightness-75"
              style={{ width: splitSectionW, opacity: 1 - rightExtend }}
              onClick={() => { if (!isOffline) { onSplit(); resetRow(); } else resetRow(); }}
            >
              <Scissors className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] font-semibold whitespace-nowrap">{t("split.btn")}</span>
            </div>
          )}
          {/* Delete section — matches expanded-row delete button style exactly */}
          <div
            className="relative flex flex-col items-center justify-center gap-1.5 overflow-hidden cursor-pointer active:brightness-75 bg-card text-destructive"
            style={{ width: deleteSectionW, minWidth: deleteSnapW }}
            onClick={() => { if (!isOffline) { onDelete(); resetRow(); } else resetRow(); }}
          >
            <div className="absolute inset-0 bg-destructive/10 pointer-events-none" />
            <Trash2 className="w-4 h-4 flex-shrink-0 relative z-10" />
            <span className="text-[10px] font-semibold whitespace-nowrap relative z-10">{t("common.delete")}</span>
          </div>
        </div>
      )}

      {/* ── Swipeable row content ── */}
      <div
        className="relative z-10 bg-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          touchAction: "pan-y",
          willChange: "transform",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default function HomeSpending() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

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
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [renameTx,    setRenameTx]    = useState<any | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [rpSheetOpen,  setRpSheetOpen]  = useState(false);
  const [rpExpanded,   setRpExpanded]   = useState<number | null>(null);
  const [larderClearConfirm, setLarderClearConfirm] = useState<number | null>(null); // larder entry id
  const larderLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (larderLongPressTimer.current) clearTimeout(larderLongPressTimer.current);
  }, []);
  // Occurrence rule: due on first login after onboarding, or after a week of inactivity.
  // We peek (no stamp) here so that a tab-leave before the animation fires does NOT
  // consume the hint. The stamp happens only when the 4 s delay completes below.
  const [swipeHintDue] = useState(() => peekSwipeHintDue());
  // Don't let the wiggle start until the splash screen has fully finished — otherwise
  // it plays underneath the splash overlay before the user can even see the row.
  const appReady = useAppReady();

  useEffect(() => {
    fetchRates().then(setRates).catch(() => {});
  }, []);
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
  const { data: goalSummaries } = useGetGoalsSummary({});
  const { data: contributions } = useListGoalContributions(
    { month: viewMonth },
    { query: { queryKey: getListGoalContributionsQueryKey({ month: viewMonth }) } }
  );
  const { data: larderSummary } = useGetLarder();
  const { data: transactions, isLoading } = useListTransactions({ startDate: fromStr, endDate: toStr } as any);
  const { data: recurringPayments } = useListRecurringPayments({
    query: { enabled: isCurrentMonth } as any,
  });
  const applyRP = useMutationWithQueue({
    endpoint: (vars: { id: number; data: any }) => `${import.meta.env.BASE_URL}api/recurring-payments/${vars.id}/apply`,
    method: "POST",
    getPayload: (vars: { id: number; data: any }) => vars.data,
    onSuccess: () => { invalidateAll(queryClient); setRpExpanded(null); setRpSheetOpen(false); },
  });
  const manualRPs = (recurringPayments ?? []).filter(rp => rp.type === "manual");

  // Map transactionId → contribution (for display + edit pre-fill)
  const contribByTxId = new Map<number, { id: number; goalId: number; name: string; color: string; amount: number; currency: string | null; accountAmount: number | null; accountCurrency: string | null }>();
  for (const c of contributions ?? []) {
    if (c.transactionId != null) {
      contribByTxId.set(c.transactionId, {
        id: c.id,
        goalId: c.goalId,
        name: c.goalName ?? "",
        color: c.goalColor ?? "#888",
        amount: c.amount,
        currency: c.currency ?? null,
        accountAmount: c.accountAmount ?? null,
        accountCurrency: c.accountCurrency ?? null,
      });
    }
  }

  // Map transactionId → Larder entry (for display + edit pre-fill), for entries
  // created by dedicating a transaction straight to the Larder instead of a goal.
  const larderByTxId = new Map<number, { id: number; amount: number; currency: string }>();
  for (const e of larderSummary?.entries ?? []) {
    if ((e.sourceType === "transaction_dedication" || e.sourceType === "recurring_payment") && e.sourceId != null && e.amount > 0) {
      larderByTxId.set(e.sourceId, { id: e.id, amount: e.amount, currency: e.currency });
    }
  }

  const { pendingTxIds, pendingRpIds, pendingTransactions } = useOfflinePendingOps();

  const create = useMutationWithQueue({
    endpoint: `${import.meta.env.BASE_URL}api/transactions`,
    method: "POST",
    getPayload: (vars: { data: any }) => vars.data,
    onSuccess: () => { invalidateAll(queryClient); setAddOpen(false); },
  });
  const update = useMutationWithQueue({
    endpoint: (vars: { id: number; data: any }) => `${import.meta.env.BASE_URL}api/transactions/${vars.id}`,
    method: "PATCH",
    getPayload: (vars: { id: number; data: any }) => vars.data,
    onSuccess: () => { invalidateAll(queryClient); setEditTx(null); },
  });
  const remove = useMutationWithQueue({
    endpoint: (vars: { id: number }) => `${import.meta.env.BASE_URL}api/transactions/${vars.id}`,
    method: "DELETE",
    onSuccess: () => { invalidateAll(queryClient); setActionTx(null); },
  });
  const updateMe = useMutationWithQueue({
    endpoint: `${import.meta.env.BASE_URL}api/auth/me`,
    method: "PATCH",
    getPayload: (vars: { data: any }) => vars.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
  });
  const deleteLarderEntry = useMutationWithQueue({
    endpoint: (vars: { id: number }) => `${import.meta.env.BASE_URL}api/larder/entries/${vars.id}`,
    method: "DELETE",
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });
      setLarderClearConfirm(null);
    },
  });

  const sorted = [...(transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  // Locked / unavailable currency transactions are excluded from the main budget total
  const isLockedForeign = (tx: any) =>
    tx.currencyLocked && tx.transactionCurrency && tx.transactionCurrency !== prefs.currency
    && !tx.currencyUnavailable;

  const total = sorted
    .filter(tx => !tx.currencyLocked && !(tx as any).currencyUnavailable && (!tx.transactionCurrency || tx.transactionCurrency === prefs.currency) && !(tx as any).foundedWithRealizedGoal && !(tx as any).isLarderFund)
    .reduce((s, tx) => s + Number(tx.amount), 0);

  const realizedGoalExcluded = sorted
    .filter(tx => !!(tx as any).foundedWithRealizedGoal && !tx.currencyLocked && !(tx as any).currencyUnavailable && (!tx.transactionCurrency || tx.transactionCurrency === prefs.currency))
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

  // Sum of all category budgets + recurring payments — used to suggest a budget when none is set
  const catBudgetSum   = (categories ?? []).reduce((s, c) => s + (c.budget != null ? Number(c.budget) : 0), 0);
  const rpBudgetSum    = (recurringPayments ?? []).reduce((s, rp) => s + Number(rp.amount), 0);
  const combinedBudgetSum = catBudgetSum + rpBudgetSum;

  // Always recompute "today" at call time so the date field stays current even if the
  // page has been open for a long time or across a midnight boundary.
  function getBlank(): TxFormState {
    return {
      amount: "", description: "", categoryId: "none",
      date: format(new Date(), "yyyy-MM-dd"), paymentMethod: "card",
      goalMode: "off", goalId: "none", goalAmount: "",
      foundedWithRealizedGoal: false,
    };
  }

  function handleCreate(form: TxFormState) {
    const categoryId = form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null;
    const isGoalExpense = form.goalMode !== "off";
    const effectiveGoalAmount = form.goalMode === "all" ? form.amount : form.goalAmount;
    create.mutate(
      { data: { amount: parseFloat(form.amount), description: form.description, categoryId, date: form.date, paymentMethod: form.paymentMethod, foundedWithRealizedGoal: form.foundedWithRealizedGoal } },
      {
        onSuccess: async (tx: any) => {
          invalidateAll(queryClient);
          setAddOpen(false);
          await syncGoalContribution({
            txId: tx.id,
            txDate: form.date,
            isGoalExpense,
            goalId: form.goalId,
            goalAmount: effectiveGoalAmount,
            existingContribId: null,
            queryClient,
            viewMonth,
            goals: goals ?? [],
            userCurrency: prefs.currency,
          });
        },
      }
    );
  }

  function handleUpdate(form: TxFormState) {
    if (!editTx) return;
    const categoryId = form.categoryId && form.categoryId !== "none" ? parseInt(form.categoryId) : null;
    const existingContrib = contribByTxId.get(editTx.id) ?? null;
    const isGoalExpense = form.goalMode !== "off";
    const effectiveGoalAmount = form.goalMode === "all" ? form.amount : form.goalAmount;

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
          foundedWithRealizedGoal: form.foundedWithRealizedGoal,
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
            isGoalExpense,
            goalId: form.goalId,
            goalAmount: effectiveGoalAmount,
            existingContribId: existingContrib?.id ?? null,
            queryClient,
            viewMonth,
            goals: goals ?? [],
            userCurrency: prefs.currency,
          });
        },
      }
    );
  }

  function saveRename() {
    if (!renameTx) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    update.mutate(
      { id: renameTx.id, data: { description: trimmed } },
      { onSuccess: () => setRenameTx(null) },
    );
  }

  function contribAmountInUserCurrency(contrib: { amount: number; currency: string | null }): number {
    if (!contrib.currency || contrib.currency === prefs.currency || !rates) return contrib.amount;
    return convertAmount(contrib.amount, contrib.currency, prefs.currency, rates);
  }

  function buildEditInitial(tx: any): TxFormState {
    const contrib = contribByTxId.get(tx.id);
    const larderEntry = !contrib ? larderByTxId.get(tx.id) : undefined;
    const contribInUser = contrib
      ? contribAmountInUserCurrency(contrib)
      : larderEntry
        ? contribAmountInUserCurrency({ amount: larderEntry.amount, currency: larderEntry.currency })
        : 0;
    const goalAmtDisplay = (contrib || larderEntry)
      ? String(Math.round(contribInUser * 100) / 100)
      : "";
    let goalMode: "off" | "all" | "part" = "off";
    if (contrib || larderEntry) {
      goalMode = Math.abs(contribInUser - Number(tx.amount)) < 0.005 ? "all" : "part";
    }
    return {
      amount: String(tx.amount),
      description: tx.description,
      categoryId: tx.categoryId ? String(tx.categoryId) : "none",
      date: tx.date,
      paymentMethod: tx.paymentMethod,
      goalMode,
      goalId: contrib ? String(contrib.goalId) : larderEntry ? "larder" : "none",
      goalAmount: goalAmtDisplay,
      foundedWithRealizedGoal: !!tx.foundedWithRealizedGoal,
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

  // Group pending (offline-queued) transactions by date so they merge into
  // the same date sections as DB transactions, appearing greyed out on top.
  const pendingByDate: Record<string, typeof pendingTransactions> = {};
  for (const tx of pendingTransactions) {
    const d = tx.date || format(new Date(), "yyyy-MM-dd");
    (pendingByDate[d] ??= []).push(tx);
  }

  // Pending RP applies: reconstruct display entries from the RP data we already have.
  // Group by today's date (apply-RP always targets today).
  type PendingRpEntry = { id: string; name: string; amount: number; color: string };
  const pendingRpEntries: PendingRpEntry[] = [];
  for (const rpId of pendingRpIds) {
    const rp = manualRPs.find(r => r.id === rpId);
    if (rp) pendingRpEntries.push({ id: `pending-rp-${rp.id}`, name: rp.name, amount: Number(rp.amount), color: rp.color });
  }
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const pendingRpByDate: Record<string, PendingRpEntry[]> = pendingRpEntries.length > 0
    ? { [todayStr]: pendingRpEntries }
    : {};

  // Merged, de-duped date list (pending dates may not appear in DB yet)
  const allDates = [...new Set([...Object.keys(pendingRpByDate), ...Object.keys(pendingByDate), ...dates])].sort((a, b) => b.localeCompare(a));

  // ── Swipe-hint wiggle: delayed, tab-aware ────────────────────────────────────
  //
  // wiggleTxId  — the transaction to wiggle, locked the first time conditions
  //               are met (state so the 4 s useEffect can react to it).
  // wiggleActive — flips true after the 4 s delay fires; passed as showHint.
  //
  // Tab-leave BEFORE 4 s  → cleanup cancels the timer; stamp never written;
  //                          on return peekSwipeHintDue() is still true → fresh 4 s.
  // Tab-leave DURING anim → stamp was written at the 4 s mark; on return
  //                          peekSwipeHintDue() returns false → no repeat.
  const [wiggleTxId, setWiggleTxId] = useState<number | null>(null);
  const wiggleLocked = useRef(false);
  const [wiggleActive, setWiggleActive] = useState(false);

  // Lock the wiggle target the first time we have a candidate.
  const _wiggleCandidate = (!searchQuery && dates.length > 0 && swipeHintDue && appReady)
    ? grouped[dates[0]]?.[0]?.id ?? null
    : null;
  useEffect(() => {
    if (wiggleLocked.current || _wiggleCandidate === null) return;
    wiggleLocked.current = true;
    setWiggleTxId(_wiggleCandidate);
  }, [_wiggleCandidate]);

  // Start a 4 s countdown once the target is locked.
  // Cleanup on unmount (tab leave) cancels the timer so the clock resets on return.
  useEffect(() => {
    if (wiggleTxId === null || wiggleActive) return;
    const id = setTimeout(() => {
      markSwipeHintSeen(); // stamp now — mid-animation tab-leave counts as "seen"
      setWiggleActive(true);
    }, 4000);
    return () => clearTimeout(id);
  }, [wiggleTxId, wiggleActive]);

  // topTxId drives showHint on the matching TransactionRow
  const topTxId = wiggleActive ? wiggleTxId : null;

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
                disabled={!isOnline}
                className="w-full flex items-center gap-3 py-1 text-left transition active:opacity-70 disabled:opacity-40"
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
              {/* Suggest category sum as budget when categories have budgets set */}
              {combinedBudgetSum > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-2">
                  <p className="text-xs text-amber-200/70 leading-relaxed">
                    {prefs.language === "pl"
                      ? `Łączna suma budżetów kategorii i płatności cyklicznych wynosi ${fmtAmt(combinedBudgetSum, prefs.currency)}. Czy chcesz użyć jej jako miesięcznego budżetu?`
                      : `Your category budgets and recurring payments sum to ${fmtAmt(combinedBudgetSum, prefs.currency)}. Use that as your monthly budget?`}
                  </p>
                  <button
                    onClick={() => saveTotalBudget(Math.ceil(combinedBudgetSum))}
                    disabled={!isOnline}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-300 transition active:opacity-70 hover:bg-amber-500/25 disabled:opacity-40"
                  >
                    <Target className="w-3 h-3" />
                    {prefs.language === "pl"
                      ? `Ustaw ${fmtAmt(combinedBudgetSum, prefs.currency)} jako budżet`
                      : `Set ${fmtAmt(combinedBudgetSum, prefs.currency)} as budget`}
                  </button>
                </div>
              )}
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
                  {realizedGoalExcluded > 0 && (
                    <p className="text-xs text-teal-400 mt-0.5">
                      +{fmtAmt(realizedGoalExcluded, prefs.currency)} {t("home.realized_goal_excluded")}
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
                  className="text-xs text-white/40 hover:text-white/70 transition disabled:opacity-40"
                  disabled={!isOnline}
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
                  {realizedGoalExcluded > 0 && (
                    <p className="text-xs text-teal-400 mt-0.5">
                      +{fmtAmt(realizedGoalExcluded, prefs.currency)} {t("home.realized_goal_excluded")}
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
        ) : sorted.length === 0 && pendingTransactions.length === 0 && pendingRpEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <p className="text-sm">{t("home.no_spending_month")}</p>
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> {t("home.add_first_entry")}
            </Button>
          </div>
        ) : filtered.length === 0 && pendingTransactions.length === 0 && pendingRpEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Search className="w-8 h-8 opacity-30" />
            <p className="text-sm">{t("home.search_no_results")}</p>
          </div>
        ) : (
          allDates.map(date => (
            <div key={date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {fmtDayDate(date)}
              </p>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {/* Pending RP-apply rows — greyed out, non-interactive */}
                {(pendingRpByDate[date] ?? []).map(prp => (
                  <div key={prp.id} className="flex items-start gap-3 px-4 py-3.5 opacity-40">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: prp.color + "33" }}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: prp.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug truncate">
                        {prp.name.length > 30 ? prp.name.slice(0, 30).trimEnd() + "…" : prp.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("tx.recurring_payment")}</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground flex-shrink-0 mt-0.5">
                      −{fmtAmt(prp.amount, prefs.currency)}
                    </p>
                  </div>
                ))}
                {/* Pending (offline-queued) rows — greyed out, non-interactive */}
                {(pendingByDate[date] ?? []).map(ptx => {
                  const cat = (categories ?? []).find(c => c.id === ptx.categoryId);
                  const dotColor   = cat?.color ?? "#666";
                  const catLabel   = cat?.name ?? t("common.uncategorized");
                  const shortName  = ptx.description.length > 30
                    ? ptx.description.slice(0, 30).trimEnd() + "…"
                    : ptx.description;
                  return (
                    <div key={ptx.id} className="flex items-start gap-3 px-4 py-3.5 opacity-40">
                      {/* Category icon */}
                      <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                        style={{ backgroundColor: dotColor + "33" }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                      </div>
                      {/* Name + category */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-foreground leading-snug truncate">{shortName}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{catLabel}</p>
                      </div>
                      {/* Amount */}
                      <p className="text-sm font-semibold text-foreground flex-shrink-0 mt-0.5">
                        −{fmtAmt(ptx.amount, prefs.currency)}
                      </p>
                    </div>
                  );
                })}
                {(grouped[date] ?? []).map(tx => {
                  const contrib    = contribByTxId.get(tx.id);
                  const isRP       = !tx.categoryId && !!(tx as any).recurringPaymentId;
                  const dotColor   = tx.categoryColor ?? (tx as any).recurringPaymentColor ?? "#666";
                  const catLabel   = tx.categoryName ?? (isRP ? t("tx.recurring_payment") : t("common.uncategorized"));
                  const isExpanded = actionTx === tx.id;

                  // Badge presence flags
                  const larderDedication = !contrib ? larderByTxId.get(tx.id) : undefined;
                  const hasSplit            = !!(tx as any).splitRole;
                  const isSplitPending      = (tx as any).splitGroupStatus === "pending";
                  const hasGoal             = !!contrib;
                  const hasLarderDedication = !!larderDedication;
                  const isRealizedGoal      = !!(tx as any).foundedWithRealizedGoal;
                  const hasReceipt          = !!tx.receiptImage;
                  const hasLocked           = !!(tx.currencyLocked && tx.transactionCurrency);
                  const hasUnavailable      = !!(tx as any).currencyUnavailable;
                  const hasForeign          = !!(tx.transactionCurrency && tx.transactionCurrency !== prefs.currency && !tx.currencyLocked && !hasUnavailable);
                  const hasFromLarder       = !!(tx as any).isLarderFund;

                  // Truncated name (30 chars max in collapsed view)
                  const shortName = tx.description.length > 30
                    ? tx.description.slice(0, 30).trimEnd() + "…"
                    : tx.description;

                  const canSwipeSplit     = !hasUnavailable && isInHousehold && tx.userId === myUserId && !(tx as any).splitRole;
                  const isUnknownCaptured = tx.description === "Unknown, Captured Online";

                  return (
                    <SwipeableTxRow
                      key={tx.id}
                      txId={tx.id}
                      canSplit={canSwipeSplit}
                      onReceipt={() => { setReceiptTx(tx); setActionTx(null); }}
                      onEdit={() => { if (!hasUnavailable) { setEditTx(tx); setActionTx(null); } }}
                      onSplit={() => { setSplitTx(tx); setActionTx(null); }}
                      onDelete={() => remove.mutate({ id: tx.id })}
                      showHint={tx.id === topTxId}
                      isOffline={!isOnline}
                    >
                      {/* ── Main row ── */}
                      <div
                        className={`flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-muted/40 cursor-pointer ${isSplitPending ? "opacity-50" : ""}`}
                        onClick={() => setActionTx(isExpanded ? null : tx.id)}
                      >
                        {/* Category icon */}
                        <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                          style={{ backgroundColor: dotColor + "33" }}>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dotColor }} />
                        </div>

                        {/* Center content */}
                        <div className="flex-1 min-w-0">
                          {/* Transaction name */}
                          <p className={`text-sm font-medium leading-snug ${isUnknownCaptured ? "text-yellow-400" : "text-foreground"}`} style={{ wordBreak: "break-word" }}>
                            {isExpanded ? tx.description : shortName}
                          </p>

                          {isExpanded ? (
                            /* ── Expanded: category + full badge pills ── */
                            <div className="mt-1 space-y-1.5">
                              <p className="text-xs text-muted-foreground">{catLabel}</p>
                              {isUnknownCaptured && (
                                <button
                                  onClick={e => { e.stopPropagation(); setRenameTx(tx); setRenameValue(tx.description); setActionTx(null); }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 active:bg-yellow-500/20 mt-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                  {t("tx.name_it")}
                                </button>
                              )}
                              {(hasSplit || hasGoal || hasLarderDedication || isRealizedGoal || hasReceipt || hasLocked || hasFromLarder) && (
                                <div className="flex flex-wrap gap-1">
                                  {hasFromLarder && (
                                    <span className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-white/50 bg-black text-[10px] font-semibold text-white/90"
                                      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.18)" }}>
                                      <Warehouse className="w-2 h-2" />
                                      {t("larder.source_fund")}
                                      {/* bottom-left diamond */}
                                      <div style={{ position:"absolute", bottom:-6, left:-5, width:10, height:10, pointerEvents:"none", animation:"gemFlash 3.2s ease-in-out 0s infinite" }}>
                                        <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.85), transparent)" }} />
                                        <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.85), transparent)" }} />
                                        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 1px rgba(255,255,255,0.75)" }} />
                                      </div>
                                      {/* top-right diamond */}
                                      <div style={{ position:"absolute", top:-6, right:-5, width:9, height:9, pointerEvents:"none", animation:"gemFlash 2.8s ease-in-out 1.5s infinite" }}>
                                        <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.75), transparent)" }} />
                                        <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.75), transparent)" }} />
                                        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 3px 1px rgba(255,255,255,0.65)" }} />
                                      </div>
                                    </span>
                                  )}
                                  {hasSplit && (
                                    <span title={(tx as any).splitRole === "issuer" ? t("split.issued_icon") : t("split.received_icon")}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-pink-500/60 bg-pink-500/10 text-[10px] font-medium text-pink-400">
                                      <Scissors className="w-2 h-2" />
                                      {t("split.btn")}
                                    </span>
                                  )}
                                  {hasGoal && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-violet-500/60 bg-violet-500/10 text-[10px] font-medium text-violet-400">
                                      <Target className="w-2 h-2 flex-shrink-0" />
                                      {contrib!.name} {fmtAmt(contribAmountInUserCurrency(contrib!), prefs.currency)}
                                    </span>
                                  )}
                                  {hasLarderDedication && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-violet-500/60 bg-violet-500/10 text-[10px] font-medium text-violet-400 select-none touch-none cursor-pointer"
                                      onClick={(e) => e.stopPropagation()}
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        if (larderLongPressTimer.current) clearTimeout(larderLongPressTimer.current);
                                        larderLongPressTimer.current = setTimeout(() => {
                                          larderLongPressTimer.current = null;
                                          setLarderClearConfirm(larderDedication!.id);
                                        }, 500);
                                      }}
                                      onPointerUp={() => {
                                        if (larderLongPressTimer.current) {
                                          clearTimeout(larderLongPressTimer.current);
                                          larderLongPressTimer.current = null;
                                        }
                                      }}
                                      onPointerLeave={() => {
                                        if (larderLongPressTimer.current) {
                                          clearTimeout(larderLongPressTimer.current);
                                          larderLongPressTimer.current = null;
                                        }
                                      }}
                                      onPointerCancel={() => {
                                        if (larderLongPressTimer.current) {
                                          clearTimeout(larderLongPressTimer.current);
                                          larderLongPressTimer.current = null;
                                        }
                                      }}
                                    >
                                      <Target className="w-2 h-2 flex-shrink-0" />
                                      {t("larder.tab")} {fmtAmt(contribAmountInUserCurrency({ amount: larderDedication!.amount, currency: larderDedication!.currency }), prefs.currency)}
                                    </span>
                                  )}
                                  {isRealizedGoal && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-teal-400/60 bg-teal-400/10 text-[10px] font-medium text-teal-300">
                                      <CheckCircle className="w-2 h-2 flex-shrink-0" />
                                      {t("tx.realized_goal_badge")}
                                    </span>
                                  )}
                                  {hasReceipt && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-white/40 bg-white/10 text-[10px] font-medium text-white">
                                      <Camera className="w-2 h-2" />
                                      {t("home.receipt_btn")}
                                    </span>
                                  )}
                                  {hasLocked && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-zinc-500/60 bg-zinc-500/10 text-[10px] font-medium text-zinc-400">
                                      <Lock className="w-2 h-2" />
                                      {tx.transactionCurrency}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* ── Collapsed: category name + colored badge dots ── */
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-muted-foreground truncate">{catLabel}</p>
                              {(hasSplit || hasGoal || hasLarderDedication || isRealizedGoal || hasReceipt || hasLocked || hasFromLarder) && (
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {hasFromLarder  && (
                                    <span className="relative flex-shrink-0 inline-block" style={{ width:10, height:10, animation:"gemFlash 2.6s ease-in-out infinite" }}>
                                      <span style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:1, height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.95), transparent)" }} />
                                      <span style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:1, background:"linear-gradient(to right, transparent, rgba(255,255,255,0.95), transparent)" }} />
                                      <span style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2.5, height:2.5, borderRadius:"50%", background:"white", boxShadow:"0 0 5px 2px rgba(255,255,255,0.85)" }} />
                                    </span>
                                  )}
                                  {hasSplit             && <span className="w-1.5 h-1.5 rounded-full bg-pink-500"    />}
                                  {(hasGoal || hasLarderDedication) && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                                  {isRealizedGoal && <span className="w-1.5 h-1.5 rounded-full bg-teal-300" />}
                                  {hasReceipt     && <span className="w-1.5 h-1.5 rounded-full bg-white"       />}
                                  {hasLocked      && <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"    />}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Amount side */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {(hasUnavailable || hasForeign) ? (
                            <p className="text-sm font-semibold text-yellow-400">
                              {Number(tx.amount).toFixed(2)} {tx.transactionCurrency}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-foreground">
                              −{fmtAmt(Number(tx.amount), tx.transactionCurrency ?? prefs.currency)}
                            </p>
                          )}
                          {pendingTxIds.has(tx.id) && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/90 font-medium"
                              title="Pending offline sync"
                            >
                              <Clock className="w-3 h-3" />
                            </span>
                          )}
                          {isExpanded && hasUnavailable && (
                            <span className="inline-flex flex-col items-end text-[10px] font-medium px-2 py-1 rounded-xl border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 leading-snug text-right">
                              <span>{t("home.currency_unavailable")}</span>
                              <span className="opacity-75">{t("home.currency_unavailable_hint")}</span>
                            </span>
                          )}
                          {isExpanded && (tx as any).splitRole === "issuer" && (tx as any).preSplitAmount != null && (
                            <p className="text-[10px] text-muted-foreground/50 leading-tight text-right">
                              {fmtAmt((tx as any).preSplitAmount, tx.transactionCurrency ?? prefs.currency)} {t("split.before_split")}
                            </p>
                          )}
                          {isExpanded && hasForeign && (
                            <button
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 active:bg-yellow-500/20"
                              onClick={e => { e.stopPropagation(); if (!isOnline) return; setConvertTx(tx); setActionTx(null); }}
                            >
                              <RefreshCw className="w-2 h-2" />
                              {t("currency.change_chip")}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── Expanded action buttons ── */}
                      {isExpanded && (
                        <div className="flex gap-2 px-3 pb-3 flex-wrap">
                          <button onClick={() => { setReceiptTx(tx); setActionTx(null); }}
                            disabled={!isOnline}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70 disabled:opacity-40">
                            <Camera className="w-3.5 h-3.5" /> {t("home.receipt_btn")}
                          </button>
                          {!hasUnavailable && (
                            <button onClick={() => { setEditTx(tx); setActionTx(null); }}
                              disabled={!isOnline}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70 disabled:opacity-40">
                              <Pencil className="w-3.5 h-3.5" /> {t("home.edit_btn")}
                            </button>
                          )}
                          {!hasUnavailable && isInHousehold && tx.userId === myUserId && !(tx as any).splitRole && (
                            <button onClick={() => { setSplitTx(tx); setActionTx(null); }}
                              disabled={!isOnline}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70 disabled:opacity-40">
                              <Scissors className="w-3.5 h-3.5" /> {t("split.btn")}
                            </button>
                          )}
                          <button
                            onClick={() => remove.mutate({ id: tx.id })}
                            disabled={!isOnline || remove.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70 disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
                          </button>
                        </div>
                      )}
                    </SwipeableTxRow>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Recurring payments button (only on current month when any manual RPs exist) ── */}
      {isCurrentMonth && (
        <button
          onClick={() => { setRpSheetOpen(true); setRpExpanded(null); }}
          className="fixed bottom-36 right-5 z-30 w-14 h-14 rounded-full bg-foreground text-background
                     shadow-xl flex items-center justify-center transition active:scale-90"
          title={t("rp.open_sheet")}
        >
          <RefreshCw className="w-6 h-6" />
        </button>
      )}

      {/* ── Floating add button ── */}
      <button
        onClick={() => setAddOpen(true)}
        data-testid="button-add-transaction"
        className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-foreground text-background
                   shadow-xl flex items-center justify-center transition active:scale-90"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Recurring Payments sheet ── */}
      {rpSheetOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setRpSheetOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111] rounded-t-2xl max-h-[70vh] flex flex-col"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-white/50" />
                <p className="font-semibold text-sm">{t("rp.open_sheet")}</p>
              </div>
              <button onClick={() => setRpSheetOpen(false)} className="text-white/40 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {manualRPs.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-sm">{t("rp.no_manual")}</div>
              ) : (
                <div className="space-y-3">
                  {manualRPs.map(rp => {
                    const isApplied  = rp.appliedThisMonth;
                    const isPending  = pendingRpIds.has(rp.id);
                    const isExpanded = rpExpanded === rp.id;
                    const isBlocked  = isApplied || isPending;
                    return (
                      <div key={rp.id}
                        className={`rounded-2xl border transition-all ${
                          isApplied
                            ? "bg-white/5 border-white/5 opacity-50"
                            : isPending
                            ? "bg-white/5 border-white/10 opacity-50"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <button
                          className="w-full flex items-center gap-3 p-4 text-left disabled:cursor-default"
                          disabled={isBlocked}
                          onClick={() => !isBlocked && setRpExpanded(isExpanded ? null : rp.id)}
                        >
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: rp.color + "33" }}>
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rp.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{rp.name}</p>
                            <p className="text-xs text-white/40">{fmtAmt(rp.amount, prefs.currency)}</p>
                          </div>
                          {isApplied ? (
                            <span className="text-xs text-white/30">{t("rp.applied_badge")}</span>
                          ) : isPending ? (
                            null
                          ) : (
                            <CheckCircle className={`w-4 h-4 flex-shrink-0 transition-colors ${isExpanded ? "text-white/60" : "text-white/20"}`} />
                          )}
                        </button>

                        {isExpanded && !isBlocked && (
                          <div className="px-4 pb-4 pt-0 border-t border-white/10">
                            <p className="text-sm text-white/60 mt-3 mb-3">{t("rp.add_question")}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setRpExpanded(null)}
                                className="flex-1 py-2 rounded-xl bg-white/10 text-xs font-medium text-white/60 transition active:opacity-70"
                              >
                                No
                              </button>
                              <button
                                onClick={() => applyRP.mutate({ id: rp.id, data: { date: new Date().toLocaleDateString("sv") } })}
                                disabled={applyRP.isPending}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold transition active:opacity-70 disabled:opacity-40"
                                style={{ backgroundColor: rp.color, color: "white" }}
                              >
                                {applyRP.isPending ? t("common.saving") : "Yes"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Add dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("home.new_tx")}</DialogTitle></DialogHeader>
          <TxForm
            initial={getBlank()}
            categories={categories ?? []}
            goals={goals ?? []}
            goalSummaries={goalSummaries ?? []}
            onSubmit={handleCreate}
            onCancel={() => setAddOpen(false)}
            loading={create.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* ── Rename "Unknown, Captured Online" dialog ── */}
      <Dialog open={!!renameTx} onOpenChange={() => setRenameTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <Pencil className="w-4 h-4" />
              {t("tx.name_it")}
            </DialogTitle>
          </DialogHeader>
          {renameTx && (
            <form onSubmit={e => { e.preventDefault(); saveRename(); }} className="space-y-4">
              {/* Greyed-out context fields above */}
              <div className="space-y-3 opacity-40 pointer-events-none select-none">
                <div className="space-y-1.5">
                  <Label>{t("common.amount")}</Label>
                  <Input disabled value={`${Number(renameTx.amount).toFixed(2)} ${renameTx.transactionCurrency ?? prefs.currency}`} />
                </div>
              </div>

              {/* Name — enabled, auto-focused */}
              <div className="space-y-1.5">
                <Label>{t("home.description")}</Label>
                <Input
                  autoFocus
                  placeholder={t("home.coffee_placeholder")}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  required
                  className="border-yellow-500/50 focus-visible:ring-yellow-500/50"
                />
              </div>

              {/* Remaining greyed-out context fields */}
              <div className="space-y-3 opacity-40 pointer-events-none select-none">
                <div className="space-y-1.5">
                  <Label>{t("home.category")}</Label>
                  <Input disabled value={renameTx.categoryName ?? t("common.uncategorized")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.date")}</Label>
                  <Input disabled value={renameTx.date ?? ""} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setRenameTx(null)}>{t("common.cancel")}</Button>
                <Button type="submit" className="flex-1 bg-yellow-500/20 border border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/30" disabled={update.isPending || !renameValue.trim()}>
                  {update.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("home.edit_tx_title")}</DialogTitle></DialogHeader>
          {editTx && (
            <TxForm
              initial={buildEditInitial(editTx)}
              categories={categories ?? []}
              goals={goals ?? []}
              goalSummaries={goalSummaries ?? []}
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
                {t("home.remove_budget")}
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
          issuerCurrency={splitTx.transactionCurrency ?? prefs.currency}
          goalContrib={contribByTxId.get(splitTx.id) ?? null}
          rates={rates}
          onClose={() => setSplitTx(null)}
          onSuccess={() => {
            invalidateAll(queryClient);
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
            <Scissors className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">{t("split.request_sent")}</p>
          </div>
        </div>
      )}

      {/* ── Larder badge clear confirm ── */}
      {larderClearConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm mx-4 mb-24 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4">
            <p className="text-sm font-medium text-white mb-1">{t("larder.clear_confirm_title")}</p>
            <p className="text-xs text-zinc-400 mb-4">{t("larder.clear_confirm_desc")}</p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                onClick={() => setLarderClearConfirm(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="flex-1 py-2 rounded-xl bg-violet-600 text-sm text-white font-medium hover:bg-violet-700 transition-colors disabled:opacity-40"
                disabled={deleteLarderEntry.isPending}
                onClick={() => deleteLarderEntry.mutate({ id: larderClearConfirm })}
              >
                {t("larder.clear_confirm_action")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
