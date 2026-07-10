import { useState, useRef } from "react";
import { t } from "@/lib/i18n";
import { receiptSrc, requestCameraPermission } from "@/lib/imageUtils";
import { CurrencyConvertSheet } from "@/components/CurrencyConvertSheet";
import { ScreenshotImportDialog } from "@/components/ScreenshotImportDialog";
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
  getListGoalsQueryKey,
  useGetLarder,
  getGetLarderQueryKey,
  useAddLarderEntry,
  useDeleteLarderEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutationWithQueue } from "@/hooks/useMutationWithQueue";
import { useOfflinePendingOps } from "@/hooks/useOfflinePendingOps";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Plus, Pencil, Trash2, Search, Camera, X, ZoomIn, ImageOff, Image, Target, RefreshCw, Lock, Clock, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { loadPrefs, currencySymbol, fmtAmt } from "@/lib/prefs";
import { fetchRates, convertAmount } from "@/lib/rates";

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
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t border-border mt-1 pt-2">
              {t("tx.goals_group")}
            </div>
            <SelectItem value="goal_larder">
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 12 12" width="12" height="12" className="flex-shrink-0" fill="currentColor" aria-hidden="true"><polygon points="6,0 7,5 12,6 7,7 6,12 5,7 0,6 5,5" /></svg>
                {t("larder.tab")}
              </span>
            </SelectItem>
            {goals.map(g => (
              <SelectItem key={`goal_${g.id}`} value={`goal_${g.id}`}>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name} ({t("tx.goal")})
                </span>
              </SelectItem>
            ))}
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
  const isOnline = useOnlineStatus();
  const sym = currencySymbol(loadPrefs().currency);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: existingContribs } = useListGoalContributions(
    { month: currentMonth },
    { query: { queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) } }
  );
  const { data: larderSummary } = useGetLarder();

  const txContribs = (existingContribs ?? []).filter(c => c.transactionId === tx.id);
  const txLarderEntries = (larderSummary?.entries ?? []).filter(
    e => e.sourceType === "transaction_dedication" && e.sourceId === tx.id && e.amount > 0,
  );

  const [goalId, setGoalId]     = useState("");
  const [amount, setAmount]     = useState("");
  const [saving, setSaving]     = useState(false);

  const addContrib = useMutationWithQueue({
    endpoint: `${import.meta.env.BASE_URL}api/goal-contributions`,
    method: "POST",
    getPayload: (vars: { data: any }) => vars.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) });
      queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
      setGoalId(""); setAmount(""); setSaving(false);
    },
    onError: () => setSaving(false),
  });

  const removeContrib = useMutationWithQueue({
    endpoint: (vars: { id: number }) => `${import.meta.env.BASE_URL}api/goal-contributions/${vars.id}`,
    method: "DELETE",
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month: currentMonth }) });
      queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
    },
  });

  const addLarderEntry = useMutationWithQueue({
    endpoint: `${import.meta.env.BASE_URL}api/larder/entries`,
    method: "POST",
    getPayload: (vars: { data: any }) => vars.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });
      setGoalId(""); setAmount(""); setSaving(false);
    },
    onError: () => setSaving(false),
  });

  const removeLarderEntry = useMutationWithQueue({
    endpoint: (vars: { id: number }) => `${import.meta.env.BASE_URL}api/larder/entries/${vars.id}`,
    method: "DELETE",
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!goalId || !amount) return;
    setSaving(true);
    if (goalId === "larder") {
      addLarderEntry.mutate({
        data: {
          amount: parseFloat(amount),
          currency: loadPrefs().currency,
          sourceType: "transaction_dedication",
          sourceId: tx.id,
        },
      });
    } else {
      addContrib.mutate({
        data: {
          goalId: parseInt(goalId),
          transactionId: tx.id,
          amount: parseFloat(amount),
          month: currentMonth,
        },
      });
    }
  }

  return (
    <div className="border-t border-border pt-4 mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">{t("tx.dedicate")}</p>
      </div>

      {(txContribs.length > 0 || txLarderEntries.length > 0) && (
        <div className="space-y-1.5">
          {txLarderEntries.map(e => (
            <div key={`larder-${e.id}`} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 12 12" width="12" height="12" className="flex-shrink-0 text-muted-foreground" fill="currentColor" aria-hidden="true"><polygon points="6,0 7,5 12,6 7,7 6,12 5,7 0,6 5,5" /></svg>
                <span className="text-sm text-muted-foreground">{t("larder.tab")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fmtAmt(Number(e.amount), loadPrefs().currency)}</span>
                <button onClick={() => removeLarderEntry.mutate({ id: e.id })}
                  className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
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
            <SelectItem value="larder">
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 12 12" width="12" height="12" className="flex-shrink-0" fill="currentColor" aria-hidden="true"><polygon points="6,0 7,5 12,6 7,7 6,12 5,7 0,6 5,5" /></svg>
                {t("larder.tab")}
              </span>
            </SelectItem>
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
        <Button type="submit" size="sm" disabled={!isOnline || saving || !goalId || !amount} className="h-9 px-3">
          {saving ? "…" : t("tx.add_btn")}
        </Button>
      </form>
    </div>
  );
}

function FoundedWithRealizedGoalToggle({ tx, isOffline }: { tx: any; isOffline?: boolean }) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(!!tx.foundedWithRealizedGoal);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setChecked(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foundedWithRealizedGoal: next }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSpendingHistoryQueryKey() });
      } else {
        setChecked(!next);
      }
    } catch {
      setChecked(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-1 pb-4 border-b border-border flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{t("tx.founded_with_realized_goal")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t("tx.founded_with_realized_goal_hint")}</p>
      </div>
      <Switch checked={checked} onCheckedChange={toggle} disabled={saving || isOffline} data-testid="switch-founded-realized-goal" />
    </div>
  );
}

function ReceiptModal({
  tx,
  open,
  onClose,
  isOffline,
}: {
  tx: any;
  open: boolean;
  onClose: () => void;
  isOffline?: boolean;
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
      // Step 1: get a presigned upload URL from the server
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: upload file directly to GCS (bypasses our server entirely)
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Failed to upload file");

      // Step 3: save the objectPath on the transaction record
      uploadReceipt.mutate({ id: tx.id, data: { imageData: objectPath } });
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
                  src={receiptSrc(tx.receiptImage)!}
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
                    disabled={isOffline || deleteReceipt.isPending}
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
                onClick={async () => {
                  const result = await requestCameraPermission();
                  if (result === "denied") {
                    alert(t("camera.denied"));
                    return;
                  }
                  cameraRef.current?.click();
                }}
                disabled={isOffline || uploadReceipt.isPending}
                data-testid="button-capture-receipt"
              >
                <Camera className="w-4 h-4" />
                Camera
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => libraryRef.current?.click()}
                disabled={isOffline || uploadReceipt.isPending}
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
            src={receiptSrc(tx.receiptImage)!}
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
  // Always invalidate ALL months of goal contributions (prefix match) so
  // progress bars update whether or not we know the transaction's month.
  qc.invalidateQueries({ queryKey: getListGoalContributionsQueryKey() });
  qc.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  qc.invalidateQueries({ queryKey: ["member-goal-contributions"] });
  qc.invalidateQueries({ queryKey: ["larder"] });
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
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [editTx, setEditTx] = useState<any | null>(null);
  const [receiptTx, setReceiptTx] = useState<any | null>(null);
  const [convertTx, setConvertTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [autoRulePrompt, setAutoRulePrompt] = useState<{ merchantName: string; oldCategoryName: string } | null>(null);
  const [nameEditTxId,  setNameEditTxId]  = useState<number | null>(null);
  const [nameEditValue, setNameEditValue] = useState("");
  const updateMerchantRule = useUpdateMerchantCategoryRule();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: categories } = useListCategories();
  const { data: goals }      = useListGoals();
  const { data: transactions, isLoading } = useListTransactions(
    filterCat !== "all" ? { categoryId: parseInt(filterCat) } : {}
  );
  const { data: allContribs } = useListGoalContributions({ month: currentMonth });
  const { data: larderSummary } = useGetLarder();

  // Map of transactionId → total larder amount for transactions whose amount was
  // dedicated to the Larder (e.g. user selected "Larder" category/goal on a transaction).
  // We aggregate (sum) in case multiple larder entries reference the same transaction.
  const larderDedicatedMap = new Map<number, number>();
  for (const e of ((larderSummary as any)?.entries ?? []) as any[]) {
    if (e.sourceType === "transaction_dedication" && e.sourceId != null && Number(e.amount) > 0) {
      larderDedicatedMap.set(e.sourceId, (larderDedicatedMap.get(e.sourceId) ?? 0) + Number(e.amount));
    }
  }

  // Map of transactionId → amount for recurring-payment transactions that credit the
  // Larder (sourceType: "recurring_payment", sourceId = tx.id). Built the same way as
  // larderDedicatedMap so both share the same collapsible purple badge.
  const larderRecurringMap = new Map<number, number>();
  for (const e of ((larderSummary as any)?.entries ?? []) as any[]) {
    if (e.sourceType === "recurring_payment" && e.sourceId != null && Number(e.amount) > 0) {
      larderRecurringMap.set(e.sourceId, (larderRecurringMap.get(e.sourceId) ?? 0) + Number(e.amount));
    }
  }

  const [isSaving, setIsSaving] = useState(false);

  const isOnline = useOnlineStatus();
  const { pendingTxIds, pendingTransactions } = useOfflinePendingOps();

  const create = useMutationWithQueue({
    endpoint: `${import.meta.env.BASE_URL}api/transactions`,
    method: "POST",
    getPayload: (vars: { data: any }) => vars.data,
    onSuccess: () => { invalidateAll(queryClient, currentMonth); setAddOpen(false); },
  });
  const remove = useMutationWithQueue({
    endpoint: (vars: { id: number }) => `${import.meta.env.BASE_URL}api/transactions/${vars.id}`,
    method: "DELETE",
    onSuccess: () => invalidateAll(queryClient),
  });

  async function saveName(txId: number) {
    const trimmed = nameEditValue.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: trimmed }),
    });
    if (res.ok) {
      invalidateAll(queryClient, currentMonth);
      setNameEditTxId(null);
    }
  }

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

  function resolveCategory(form: TxFormState): { categoryId: number | null; goalContribution?: { goalId: number; amount: number }; larderAmount?: number } {
    if (!form.categoryId || form.categoryId === "none") return { categoryId: null };
    if (form.categoryId === "goal_larder") {
      return { categoryId: null, larderAmount: parseFloat(form.amount) };
    }
    if (form.categoryId.startsWith("goal_")) {
      const goalId = parseInt(form.categoryId.replace("goal_", ""));
      return { categoryId: null, goalContribution: { goalId, amount: parseFloat(form.amount) } };
    }
    return { categoryId: parseInt(form.categoryId) };
  }

  function handleCreate(form: TxFormState) {
    if (!isOnline) return;
    const { categoryId, goalContribution, larderAmount } = resolveCategory(form);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    create.mutate(
      { data: { amount: parseFloat(form.amount), description: form.description, categoryId, date: form.date, paymentMethod: form.paymentMethod } },
      {
        onSuccess: async (tx) => {
          if (goalContribution) {
            const goal = (goals ?? []).find((g: any) => g.id === goalContribution.goalId);
            const goalCurrency: string = (goal as any)?.currency ?? prefs.currency;
            let contribAmount = goalContribution.amount;
            if (goalCurrency !== prefs.currency) {
              try {
                const convRates = await fetchRates();
                contribAmount = convertAmount(goalContribution.amount, prefs.currency, goalCurrency, convRates);
              } catch { /* keep original if fetch fails */ }
            }
            fetch("/api/goal-contributions", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                goalId: goalContribution.goalId,
                transactionId: (tx as any).id,
                amount: contribAmount,
                currency: goalCurrency,
                month,
              }),
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListGoalContributionsQueryKey({ month }) });
            });
          } else if (larderAmount && larderAmount > 0) {
            fetch("/api/larder/entries", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: larderAmount,
                currency: prefs.currency,
                sourceType: "transaction_dedication",
                sourceId: (tx as any).id,
              }),
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });
            });
          }
        },
      }
    );
  }

  async function handleUpdate(form: TxFormState) {
    if (!editTx || isSaving) return;
    const txId = editTx.id;
    const { categoryId, goalContribution, larderAmount } = resolveCategory(form);

    // Was this an auto-assigned category that the user is now overriding?
    const wasAutoAssigned = editTx.categoryAutoAssigned && categoryId !== editTx.categoryId;
    const overriddenMerchant = wasAutoAssigned ? editTx.description : null;
    const overriddenCategoryName = wasAutoAssigned ? (editTx.categoryName ?? "that category") : null;

    // Detect whether this tx previously had a goal assignment (categoryId null = goal tx)
    const hadGoal = !editTx.categoryId;
    const nowHasGoal = !!goalContribution;
    const nowHasLarder = larderAmount != null && larderAmount > 0;
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
        // Search by transactionId across ALL months — avoids missing contributions
        // on transactions from past months.
        const contribsRes = await fetch(`/api/goal-contributions?transactionId=${txId}`, { credentials: "include" });
        const linked: any[] = contribsRes.ok ? await contribsRes.json() : [];
        await Promise.all(linked.map((c: any) =>
          fetch(`/api/goal-contributions/${c.id}`, { method: "DELETE", credentials: "include" }),
        ));

        if (goalContribution) {
          const goal = (goals ?? []).find((g: any) => g.id === goalContribution.goalId);
          const goalCurrency: string = (goal as any)?.currency ?? prefs.currency;
          let contribAmount = goalContribution.amount;
          if (goalCurrency !== prefs.currency) {
            try {
              const convRates = await fetchRates();
              contribAmount = convertAmount(goalContribution.amount, prefs.currency, goalCurrency, convRates);
            } catch { /* keep original if fetch fails */ }
          }
          await fetch("/api/goal-contributions", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              goalId: goalContribution.goalId,
              transactionId: txId,
              amount: contribAmount,
              currency: goalCurrency,
              month: currentMonth,
            }),
          });
        }
      }

      // Step 3: Manage the Larder entry when the tx is dedicated straight to the Larder,
      // or clean up a stale one when switching away from it.
      const larderRes = await fetch("/api/larder", { credentials: "include" });
      const larderData = larderRes.ok ? await larderRes.json() : { entries: [] };
      const priorLarderEntries: any[] = (larderData.entries ?? []).filter(
        (e: any) => e.sourceType === "transaction_dedication" && e.sourceId === txId,
      );
      await Promise.all(priorLarderEntries.map(e =>
        fetch(`/api/larder/entries/${e.id}`, { method: "DELETE", credentials: "include" }),
      ));
      if (nowHasLarder) {
        await fetch("/api/larder/entries", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: larderAmount,
            currency: prefs.currency,
            sourceType: "transaction_dedication",
            sourceId: txId,
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScreenshotOpen(true)} data-testid="button-import-screenshot" className="gap-2" disabled={!isOnline}>
            <ScanLine className="w-4 h-4" /> {t("tx.import_screenshot")}
          </Button>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction" className="gap-2" disabled={!isOnline}>
            <Plus className="w-4 h-4" /> {t("common.add")}
          </Button>
        </div>
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
      ) : filtered.length === 0 && pendingTransactions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">{t("tx.no_results")}</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="divide-y divide-border">
            {/* Pending (offline-queued) transactions shown immediately, greyed out */}
            {pendingTransactions.map(tx => {
              const cat = (categories ?? []).find(c => c.id === tx.categoryId);
              const displayColor = cat?.color ?? "#94a3b8";
              const displayName  = cat?.name ?? t("common.uncategorized");
              const payLabel = getPaymentLabel()[tx.paymentMethod] ?? tx.paymentMethod;
              return (
                <div key={tx.id} className="flex items-center gap-4 px-5 py-4 opacity-50">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate text-muted-foreground">{tx.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{displayName} · {payLabel}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{tx.date}</span>
                  <span className="font-semibold text-sm w-20 text-right flex-shrink-0 text-muted-foreground">
                    {fmtAmt(tx.amount, prefs.currency)}
                  </span>
                </div>
              );
            })}
            {filtered.map(tx => {
              const goalContrib = !tx.categoryId
                ? (allContribs ?? []).find((c: any) => c.transactionId === tx.id)
                : null;
              const isRP = !tx.categoryId && !!tx.recurringPaymentId;
              const displayName  = tx.categoryName ?? (goalContrib ? `${goalContrib.goalName} (${t("tx.goal")})` : isRP ? t("tx.recurring_payment") : t("common.uncategorized"));
              const displayColor = tx.categoryColor ?? goalContrib?.goalColor ?? tx.recurringPaymentColor ?? "#94a3b8";
              return (
                <div key={tx.id} data-testid={`row-transaction-${tx.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />
                  <div className="flex-1 min-w-0">
                    {nameEditTxId === tx.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={nameEditValue}
                          onChange={e => setNameEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveName(tx.id);
                            if (e.key === "Escape") setNameEditTxId(null);
                          }}
                          className="flex-1 min-w-0 px-2 py-0.5 rounded-lg bg-muted border border-yellow-500/40 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-yellow-500/60"
                        />
                        <button
                          onClick={() => saveName(tx.id)}
                          className="text-[10px] font-semibold text-yellow-400 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/60 flex-shrink-0"
                        >{t("common.save")}</button>
                        <button
                          onClick={() => setNameEditTxId(null)}
                          className="text-[10px] font-medium text-muted-foreground flex-shrink-0"
                        >{t("common.cancel")}</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-sm font-medium truncate ${tx.description === "Unknown, Captured Online" ? "text-yellow-400" : ""}`}>{tx.description}</p>
                          {((tx as any).isLarderFund || larderRecurringMap.has(tx.id) || larderDedicatedMap.has(tx.id)) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 tracking-wide flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                              {t("larder.dedicated_badge")}
                            </span>
                          )}
                          {tx.receiptImage && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              <Camera className="w-2.5 h-2.5" /> receipt
                            </span>
                          )}
                        </div>
                        {tx.description === "Unknown, Captured Online" && (
                          <button
                            onClick={() => { setNameEditTxId(tx.id); setNameEditValue(tx.description); }}
                            disabled={!isOnline}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-xl border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors mt-1 disabled:opacity-40"
                          >
                            <Pencil className="w-3 h-3" />
                            {t("tx.name_it")}
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{displayName} · {getPaymentLabel()[tx.paymentMethod] ?? tx.paymentMethod}{tx.userName ? ` · ${tx.userName}` : ""}</p>
                      </>
                    )}
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
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-yellow-500/60 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors disabled:opacity-40"
                      title={t("currency.change_chip_title")}
                      disabled={!isOnline}
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
                      disabled={!isOnline}
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      data-testid={`button-edit-transaction-${tx.id}`}
                      onClick={() => setEditTx(tx)}
                      disabled={!isOnline}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      data-testid={`button-delete-transaction-${tx.id}`}
                      onClick={() => remove.mutate({ id: tx.id })}
                      disabled={!isOnline}
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

      <ScreenshotImportDialog
        open={screenshotOpen}
        onClose={() => setScreenshotOpen(false)}
        onImported={() => invalidateAll(queryClient, currentMonth)}
      />

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
            const existingLarderEntry = !editTx.categoryId && !existingContrib
              ? (larderSummary?.entries ?? []).find((e: any) => e.sourceType === "transaction_dedication" && e.sourceId === editTx.id && e.amount > 0)
              : null;
            const initCategoryId = editTx.categoryId
              ? String(editTx.categoryId)
              : existingContrib ? `goal_${existingContrib.goalId}`
              : existingLarderEntry ? "goal_larder" : "none";
            return (
              <>
                <FoundedWithRealizedGoalToggle tx={editTx} isOffline={!isOnline} />
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
          isOffline={!isOnline}
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
