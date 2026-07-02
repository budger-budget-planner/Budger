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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Camera, X, ZoomIn, ImageOff, Image, ChevronLeft, ChevronRight, Target, Search, RefreshCw, Lock, Scissors, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { compressImage } from "@/lib/imageUtils";
import { loadPrefs, savePrefs, currencySymbol, fmtAmt } from "@/lib/prefs";
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
  const cameraRef    = useRef<HTMLInputElement>(null);
  const libraryRef   = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(tx.receiptImage ?? null);

  const uploadReceipt = useUploadReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});
  const deleteReceipt = useDeleteReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
    setLocalImage(null);
  }}});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageData = await compressImage(file);
      uploadReceipt.mutate(
        { id: tx.id, data: { imageData } },
        { onSuccess: () => setLocalImage(imageData) },
      );
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
            {localImage ? (
              <>
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={localImage} alt="Receipt"
                    className="w-full object-cover max-h-64 cursor-pointer"
                    onClick={() => setLightbox(true)} />
                  {(uploadReceipt.isPending || deleteReceipt.isPending) && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => setLightbox(true)}>
                    <ZoomIn className="w-4 h-4" /> View
                  </Button>
                  <Button variant="destructive" className="gap-2"
                    onClick={() => deleteReceipt.mutate({ id: tx.id })}
                    disabled={deleteReceipt.isPending}>
                    <Trash2 className="w-4 h-4" /> Remove
                  </Button>
                </div>
              </>
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

      {lightbox && localImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(false)}>
            <X className="w-6 h-6" />
          </button>
          <img src={localImage} alt="Receipt full size"
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
  const [recipientId, setRecipientId] = useState("");
  const [splitMode, setSplitMode] = useState<"amount" | "percent">("amount");
  const [splitValue, setSplitValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const txAmount = Number(tx.amount);
  const splitAmt = splitMode === "amount"
    ? parseFloat(splitValue) || 0
    : ((parseFloat(splitValue) || 0) / 100) * txAmount;

  // For locked or foreign-currency transactions, show amounts in the transaction's
  // own currency, not the account currency.
  const effectiveSym = tx.transactionCurrency ? currencySymbol(tx.transactionCurrency) : sym;

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

  // Block split if it would leave less than the goal-dedicated amount on this transaction
  const wouldViolateGoal = !!(
    goalAmountInTxCurrency > 0 && splitValue !== "" && splitAmt > 0 &&
    (txAmount - splitAmt) < goalAmountInTxCurrency
  );

  const isValid = !!recipientId && splitAmt > 0 && splitAmt <= txAmount && !wouldViolateGoal;

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
          <Scissors className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">{t("split.title")}</p>
            <p className="text-xs text-muted-foreground truncate">{tx.description} · {effectiveSym}{txAmount.toFixed(2)}</p>
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
                  onClick={() => { setSplitMode("amount"); setSplitValue(""); }}>{effectiveSym}</button>
                <button type="button"
                  className={`px-3 py-1.5 transition-colors ${splitMode === "percent" ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
                  onClick={() => { setSplitMode("percent"); setSplitValue(""); }}>%</button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {splitMode === "amount" ? effectiveSym : "%"}
              </span>
              <Input type="number" min="0.01" step={splitMode === "amount" ? "0.01" : "1"}
                max={splitMode === "amount" ? txAmount : 100}
                placeholder="0" value={splitValue} onChange={e => setSplitValue(e.target.value)}
                className="pl-7" />
            </div>
            {splitValue && splitAmt > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("split.recipient_pays")}: {effectiveSym}{splitAmt.toFixed(2)} · {t("split.you_pay")}: {effectiveSym}{(txAmount - splitAmt).toFixed(2)}
              </p>
            )}
            {wouldViolateGoal && goalContrib && (
              <div className="flex items-start gap-2 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-400">
                  {t("split.goal_block", {
                    rem: `${effectiveSym}${(txAmount - splitAmt).toFixed(2)}`,
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

  // Find and delete ALL contributions for this transaction across every month.
  // Searching by transactionId avoids missing contributions from past months
  // when the caller's viewMonth doesn't match the transaction's date month.
  const linkedRes = await fetch(`/api/goal-contributions?transactionId=${txId}`, { credentials: "include" });
  const linkedContribs: any[] = linkedRes.ok ? await linkedRes.json() : [];
  const idsToDelete = new Set<number>(linkedContribs.map((c: any) => c.id));
  if (existingContribId != null) idsToDelete.add(existingContribId);
  await Promise.all([...idsToDelete].map(id =>
    fetch(`/api/goal-contributions/${id}`, { method: "DELETE", credentials: "include" }),
  ));

  // Create new contribution if needed, converted to goal's base currency.
  // We also store accountAmount/accountCurrency (the pre-conversion user-currency amount)
  // so that split validation can compare amounts in the same currency as the transaction.
  if (isGoalExpense && goalId && goalId !== "none" && parseFloat(goalAmount) > 0) {
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
}

function SwipeableTxRow({
  txId,
  canSplit,
  onReceipt,
  onEdit,
  onSplit,
  onDelete,
  showHint,
  children,
}: {
  txId: number;
  canSplit: boolean;
  onReceipt: () => void;
  onEdit: () => void;
  onSplit: () => void;
  onDelete: () => void;
  showHint?: boolean;
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
    setAnimating(true);
    go(() => setOffset(-15), 100);          // left ×1 (half)
    go(() => setOffset(0),   260);          // back
    go(() => setOffset(-30), 370);          // left ×2 (full)
    go(() => setOffset(0),   530);          // back
    go(() => setOffset(19),  660);          // right ×1 (half)
    go(() => setOffset(0),   820);          // back
    go(() => setOffset(38),  930);          // right ×2 (full)
    go(() => setOffset(0),   1090);         // back
    go(() => setAnimating(false), 1200);
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
    requestAnimationFrame(() => setTimeout(() => setAnimating(false), 320));
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

    if (off < -ACTION_THRESHOLD) {
      // Full left extend → delete
      setAnimating(true);
      setOffset(-window.innerWidth);
      setTimeout(() => { onDelete(); snapTo(0, null); }, 300);
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
              onClick={() => { onReceipt(); resetRow(); }}
            >
              <Camera className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] font-semibold whitespace-nowrap">{t("home.receipt_btn")}</span>
            </div>
          )}
          {/* Edit section — expands to fill during extension, icon stays centred */}
          <div
            className="flex flex-col items-center justify-center gap-1.5 text-white cursor-pointer active:brightness-75 overflow-hidden"
            style={{ width: editSectionW, minWidth: deleteSnapW }}
            onClick={() => { onEdit(); resetRow(); }}
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
              onClick={() => { onSplit(); resetRow(); }}
            >
              <Scissors className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] font-semibold whitespace-nowrap">{t("split.btn")}</span>
            </div>
          )}
          {/* Delete section — always red, expands to fill during extension */}
          <div
            className="flex flex-col items-center justify-center gap-1.5 text-white bg-red-700 overflow-hidden cursor-pointer active:brightness-75"
            style={{ width: deleteSectionW, minWidth: deleteSnapW }}
            onClick={() => { onDelete(); resetRow(); }}
          >
            <Trash2 className="w-4 h-4 flex-shrink-0" />
            <span className="text-[10px] font-semibold whitespace-nowrap">{t("common.delete")}</span>
          </div>
        </div>
      )}

      {/* ── Swipeable row content ── */}
      <div
        className="relative z-10 bg-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 0.15s cubic-bezier(0.4,0,0.2,1)" : "none",
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
  const { data: contributions } = useListGoalContributions(
    { month: viewMonth },
    { query: { queryKey: getListGoalContributionsQueryKey({ month: viewMonth }) } }
  );
  const { data: transactions, isLoading } = useListTransactions({ startDate: fromStr, endDate: toStr } as any);

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

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setAddOpen(false); } } });
  const update = useUpdateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setEditTx(null); } } });
  const remove = useDeleteTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setActionTx(null); } } });
  const updateMe = useUpdateMe({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) } });

  const sorted = [...(transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  // Locked / unavailable currency transactions are excluded from the main budget total
  const isLockedForeign = (tx: any) =>
    tx.currencyLocked && tx.transactionCurrency && tx.transactionCurrency !== prefs.currency
    && !tx.currencyUnavailable;

  const total = sorted
    .filter(tx => !tx.currencyLocked && !(tx as any).currencyUnavailable && (!tx.transactionCurrency || tx.transactionCurrency === prefs.currency) && !(tx as any).foundedWithRealizedGoal)
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

  const blank: TxFormState = {
    amount: "", description: "", categoryId: "none",
    date: format(new Date(), "yyyy-MM-dd"), paymentMethod: "card",
    goalMode: "off", goalId: "none", goalAmount: "",
    foundedWithRealizedGoal: false,
  };

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
    const contribInUser = contrib ? contribAmountInUserCurrency(contrib) : 0;
    const goalAmtDisplay = contrib
      ? String(Math.round(contribInUser * 100) / 100)
      : "";
    let goalMode: "off" | "all" | "part" = "off";
    if (contrib) {
      goalMode = Math.abs(contribInUser - Number(tx.amount)) < 0.005 ? "all" : "part";
    }
    return {
      amount: String(tx.amount),
      description: tx.description,
      categoryId: tx.categoryId ? String(tx.categoryId) : "none",
      date: tx.date,
      paymentMethod: tx.paymentMethod,
      goalMode,
      goalId: contrib ? String(contrib.goalId) : "none",
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

  // Top-most visible transaction ID for the swipe hint wiggle — always shown on mount
  const topTxId = (!searchQuery && dates.length > 0)
    ? grouped[dates[0]]?.[0]?.id ?? null
    : null;

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
                  const contrib    = contribByTxId.get(tx.id);
                  const dotColor   = tx.categoryColor ?? "#666";
                  const catLabel   = tx.categoryName ?? t("common.uncategorized");
                  const isExpanded = actionTx === tx.id;

                  // Badge presence flags
                  const hasSplit       = !!(tx as any).splitRole;
                  const hasGoal        = !!contrib;
                  const isRealizedGoal = !!(tx as any).foundedWithRealizedGoal;
                  const hasReceipt     = !!tx.receiptImage;
                  const hasLocked      = !!(tx.currencyLocked && tx.transactionCurrency);
                  const hasUnavailable = !!(tx as any).currencyUnavailable;
                  const hasForeign     = !!(tx.transactionCurrency && tx.transactionCurrency !== prefs.currency && !tx.currencyLocked && !hasUnavailable);

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
                    >
                      {/* ── Main row ── */}
                      <div
                        className="flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-muted/40 cursor-pointer"
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
                              {(hasSplit || hasGoal || isRealizedGoal || hasReceipt || hasLocked) && (
                                <div className="flex flex-wrap gap-1">
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
                              {(hasSplit || hasGoal || isRealizedGoal || hasReceipt || hasLocked) && (
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {hasSplit       && <span className="w-1.5 h-1.5 rounded-full bg-pink-500"    />}
                                  {hasGoal        && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
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
                              onClick={e => { e.stopPropagation(); setConvertTx(tx); setActionTx(null); }}
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
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                       bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                            <Camera className="w-3.5 h-3.5" /> {t("home.receipt_btn")}
                          </button>
                          {!hasUnavailable && (
                            <button onClick={() => { setEditTx(tx); setActionTx(null); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                              <Pencil className="w-3.5 h-3.5" /> {t("home.edit_btn")}
                            </button>
                          )}
                          {!hasUnavailable && isInHousehold && tx.userId === myUserId && !(tx as any).splitRole && (
                            <button onClick={() => { setSplitTx(tx); setActionTx(null); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                              <Scissors className="w-3.5 h-3.5" /> {t("split.btn")}
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
                    </SwipeableTxRow>
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
          issuerCurrency={splitTx.transactionCurrency ?? prefs.currency}
          goalContrib={contribByTxId.get(splitTx.id) ?? null}
          rates={rates}
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
            <Scissors className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">{t("split.request_sent")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
