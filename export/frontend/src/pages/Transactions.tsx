import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { receiptSrc, compressImage, readImageFile } from "@/lib/imageUtils";
import { ReceiptImg } from "@/components/ReceiptImg";
import { ReceiptManager } from "@/components/ReceiptManager";
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
} from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useMutationWithQueue } from "@/hooks/useMutationWithQueue";
import { useOfflinePendingOps } from "@/hooks/useOfflinePendingOps";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Plus, Pencil, Trash2, Search, Camera, X, ZoomIn, ImageOff, Image, Target, RefreshCw, Lock, Clock, ScanLine, ChevronLeft, ChevronRight } from "lucide-react";
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
      const res = await apiFetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
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

/**
 * Renders a receipt image safely on iOS Safari.
 * iOS Safari refuses to display data URLs larger than ~2 MB in <img> tags.
 * This component converts any data URL to a blob URL at mount time, which
 * has no size restriction and renders correctly on all platforms.
 */
/**
 * Renders a receipt image safely on iOS Safari.
 *
 * iOS Safari refuses to display data URLs larger than ~2 MB in <img> tags.
 * This component converts any data URL to a blob URL before rendering, which
 * has no size restriction and works on all platforms.
 *
 * A skeleton placeholder is shown while the blob URL is being created so the
 * broken-image icon is never visible.
 */
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
  const libraryRef = useRef<HTMLInputElement>(null);
  // null = closed; number = index of image shown in lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // undefined = no local override (use server data); string[] = optimistic list
  const [localImages, setLocalImages] = useState<string[] | undefined>(undefined);
  const [processingFile, setProcessingFile] = useState(false);
  const processingFileRef = useRef(false);
  // Guard: on iOS, opening the native file picker blurs the Dialog and triggers
  // onOpenChange(false) → onClose() → component unmounts → input is gone when
  // the picker returns, so onChange never fires.  Block dialog close while the
  // picker is in flight; reset on window focus (picker closed, any outcome).
  const filePickerActiveRef = useRef(false);

  useEffect(() => {
    if (!open) { setLocalImages(undefined); setLightboxIdx(null); }
  }, [open]);

  // Reset the file-picker guard only for the cancelled-picker path. When a
  // photo is selected, the guard stays active until the async read/upload is
  // complete; clearing it at the start of onChange lets Radix unmount this
  // dialog while iOS is still returning from "Use Photo".
  useEffect(() => {
    const onFocus = () => {
      window.setTimeout(() => {
        // If iOS has already populated the input, keep the dialog mounted
        // until its change event arrives. If the picker was cancelled, there
        // is no file and it is safe to unlock dismissal.
        if (!processingFileRef.current && !libraryRef.current?.files?.length) {
          filePickerActiveRef.current = false;
        }
      }, 1500);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Derive the canonical list from server data, with local optimistic override.
  function serverImages(): string[] {
    if (Array.isArray(tx.receiptImages) && tx.receiptImages.length > 0) return tx.receiptImages;
    if (tx.receiptImage) return [tx.receiptImage];
    return [];
  }
  const effectiveImages = localImages !== undefined ? localImages : serverImages();
  const canAddMore = effectiveImages.length < 3;

  const uploadReceipt = useUploadReceipt({
    mutation: {
      onSuccess: (data: any) => {
        const next: string[] = Array.isArray(data?.receiptImages) && data.receiptImages.length > 0
          ? data.receiptImages
          : data?.receiptImage ? [data.receiptImage] : effectiveImages;
        setLocalImages(next);
        queryClient.setQueriesData({ queryKey: getListTransactionsQueryKey() }, (current: unknown) => {
          if (!Array.isArray(current)) return current;
          return current.map((item: any) => item.id === tx.id
            ? { ...item, receiptImage: next[0] ?? null, receiptImages: next }
            : item);
        });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
      },
      onError: (error: any) => {
        const message = error?.data?.error ?? error?.message?.replace(/^HTTP \d+ [^:]+:\s*/, "") ?? t("tx.image_error");
        toast.error(message);
      },
    },
  });
  const deleteReceipt = useDeleteReceipt({
    mutation: {
      onSuccess: (data: any) => {
        const next: string[] = Array.isArray(data?.receiptImages) ? data.receiptImages
          : data?.receiptImage ? [data.receiptImage] : [];
        setLocalImages(next);
        setLightboxIdx(null);
        queryClient.setQueriesData({ queryKey: getListTransactionsQueryKey() }, (current: unknown) => {
          if (!Array.isArray(current)) return current;
          return current.map((item: any) => item.id === tx.id
            ? { ...item, receiptImage: next[0] ?? null, receiptImages: next }
            : item);
        });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
      },
      onError: (error: any) => {
        const message = error?.data?.error ?? error?.message?.replace(/^HTTP \d+ [^:]+:\s*/, "") ?? t("tx.image_error");
        toast.error(message);
      },
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // iOS may emit both `input` and `change` for one selection. Only the
    // first event is allowed to start the read/upload pipeline.
    if (processingFileRef.current) return;
    const file = e.target.files?.[0];
    if (!file) {
      filePickerActiveRef.current = false;
      return;
    }
    e.target.value = "";
    processingFileRef.current = true;
    setProcessingFile(true);
    let uploadStarted = false;
    try {
      let dataUrl: string;
      try {
        dataUrl = await compressImage(file, 800, 0.65);
      } catch {
        // Safari cannot decode HEIC/HEIF for canvas conversion on some iOS
        // versions. Send the original file instead; the API supports it.
        dataUrl = await readImageFile(file);
      }
      uploadStarted = true;
      await Promise.race([
        uploadReceipt.mutateAsync({ id: tx.id, data: { imageData: dataUrl } }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Receipt upload timed out. Please try again.")), 30000);
        }),
      ]);
    } catch (error: any) {
      if (!uploadStarted) {
        toast.error(error?.message ?? t("tx.image_error"));
      }
    } finally {
      processingFileRef.current = false;
      filePickerActiveRef.current = false;
      setProcessingFile(false);
    }
  }

  const isBusy = processingFile || uploadReceipt.isPending || deleteReceipt.isPending;

  return (
    <>
      <Dialog open={open && lightboxIdx === null} onOpenChange={(o) => { if (!o && !filePickerActiveRef.current) onClose(); }}>
        <DialogContent
          className="max-w-sm"
          onInteractOutside={(e) => { if (filePickerActiveRef.current) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (filePickerActiveRef.current) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{t("tx.receipt_label", { desc: tx.description })}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{fmtAmt(Number(tx.amount), loadPrefs().currency)}</span>
              {" "}· {tx.categoryName ?? t("common.uncategorized")} · {tx.date}
            </div>

            {effectiveImages.length > 0 ? (
              <div className={`grid gap-2 ${effectiveImages.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {effectiveImages.map((img, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-border">
                    <ReceiptImg
                      src={receiptSrc(img)!}
                      alt={t("tx.receipt_alt")}
                      className="w-full object-cover cursor-pointer"
                      style={{ maxHeight: effectiveImages.length === 1 ? 240 : 140 }}
                      onClick={() => setLightboxIdx(idx)}
                      data-testid={`img-receipt-${idx}`}
                    />
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive disabled:opacity-40"
                      onClick={() => deleteReceipt.mutate({ id: tx.id, index: idx })}
                      disabled={isOffline || isBusy}
                      data-testid={`button-delete-receipt-${idx}`}
                      title={t("tx.remove_receipt")}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
                <ImageOff className="w-8 h-8 opacity-40" />
                <p className="text-sm text-center">{t("tx.no_receipt")}</p>
              </div>
            )}

            {isBusy && (
              <div className="flex justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}

            {effectiveImages.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">{t("tx.receipt_count", { count: effectiveImages.length })}</p>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
               onClick={() => {
                 filePickerActiveRef.current = true;
                 if (libraryRef.current) libraryRef.current.value = "";
                 libraryRef.current?.click();
               }}
              disabled={isOffline || isBusy || !canAddMore}
              data-testid="button-add-receipt"
            >
              <Plus className="w-4 h-4" />
              {effectiveImages.length === 0 ? t("tx.add_receipt") : t("tx.add_another_receipt")}
            </Button>

             <Button variant="ghost" className="w-full" onClick={onClose} disabled={isBusy}>{t("tx.done")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxIdx !== null && effectiveImages[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>
          {effectiveImages.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white disabled:opacity-30"
                onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null && i > 0 ? i - 1 : i); }}
                disabled={lightboxIdx === 0}
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white disabled:opacity-30"
                onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null && i < effectiveImages.length - 1 ? i + 1 : i); }}
                disabled={lightboxIdx === effectiveImages.length - 1}
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}
          <ReceiptImg
            src={receiptSrc(effectiveImages[lightboxIdx])!}
            alt={t("tx.receipt_full_alt")}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          {effectiveImages.length > 1 && (
            <div className="absolute bottom-6 flex gap-2">
              {effectiveImages.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                  className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIdx ? "bg-white" : "bg-white/40"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        // Do not use display:none here. iOS Safari can ignore a programmatic
        // click on a display:none file input, which makes the picker appear to
        // work while onChange never fires. Keep it in the document, visually
        // hidden, and trigger it directly from the user's button tap.
        className="absolute -z-10 h-px w-px opacity-0"
        tabIndex={-1}
        onChange={handleFileChange}
        onInput={e => handleFileChange(e as unknown as React.ChangeEvent<HTMLInputElement>)}
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

function cacheTransactionUpdate(qc: ReturnType<typeof useQueryClient>, updated: any) {
  if (!updated?.id) return;
  qc.setQueriesData({ queryKey: getListTransactionsQueryKey() }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((tx: any) => tx.id === updated.id ? { ...tx, ...updated } : tx);
  });
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
  const update = useMutationWithQueue<{
    id: number;
    data: Record<string, unknown>;
    mode?: "form" | "name";
    autoPrompt?: { merchantName: string; oldCategoryName: string };
  }>({
    endpoint: vars => `${import.meta.env.BASE_URL}api/transactions/${vars.id}`,
    method: "PATCH",
    getPayload: vars => vars.data,
    onSuccess: (data, vars) => {
      if (data && typeof data === "object" && "id" in data) {
        cacheTransactionUpdate(queryClient, data);
      }
      invalidateAll(queryClient, currentMonth);
      if (vars.mode === "name") {
        setNameEditTxId(null);
      } else {
        if (data && vars.autoPrompt) {
          setAutoRulePrompt(vars.autoPrompt);
        }
        setEditTx((prev: any) => (prev?.id === vars.id ? null : prev));
        setIsSaving(false);
      }
    },
    onError: (error, vars) => {
      if (vars.mode !== "name") setIsSaving(false);
      toast.error(error.message || t("common.error_saving") || "Failed to save changes.");
    },
  });

  async function saveName(txId: number) {
    const trimmed = nameEditValue.trim();
    if (!trimmed) return;
    update.mutate({ id: txId, data: { description: trimmed }, mode: "name" });
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

  async function handleCreate(form: TxFormState) {
    const { categoryId, goalContribution, larderAmount } = resolveCategory(form);
    const now = new Date();
    const month = /^\d{4}-\d{2}/.test(form.date)
      ? form.date.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let atomicGoalContribution: any = null;
    if (goalContribution) {
      const goal = (goals ?? []).find((g: any) => g.id === goalContribution.goalId);
      const goalCurrency: string = (goal as any)?.currency ?? prefs.currency;
      let contribAmount = goalContribution.amount;
      if (goalCurrency !== prefs.currency) {
        try {
          contribAmount = convertAmount(goalContribution.amount, prefs.currency, goalCurrency, await fetchRates());
        } catch {
          // Keep the account-currency amount if rates are temporarily unavailable.
        }
      }
      atomicGoalContribution = {
        goalId: goalContribution.goalId,
        amount: contribAmount,
        currency: goalCurrency,
        month,
      };
    }
    create.mutate(
      {
        data: {
          amount: parseFloat(form.amount),
          description: form.description,
          categoryId,
          date: form.date,
          paymentMethod: form.paymentMethod,
          goalContribution: atomicGoalContribution,
          larderAmount: larderAmount ?? null,
          larderCurrency: larderAmount ? prefs.currency : null,
        },
      },
      {
        onSuccess: () => invalidateAll(queryClient, month),
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

    const nowHasGoal = !!goalContribution;
    const nowHasLarder = larderAmount != null && larderAmount > 0;
    setIsSaving(true);
    let atomicGoalContribution: any = null;
    if (goalContribution) {
      const goal = (goals ?? []).find((g: any) => g.id === goalContribution.goalId);
      const goalCurrency: string = (goal as any)?.currency ?? prefs.currency;
      let contribAmount = goalContribution.amount;
      if (goalCurrency !== prefs.currency) {
        try {
          contribAmount = convertAmount(goalContribution.amount, prefs.currency, goalCurrency, await fetchRates());
        } catch {
          // Keep the account-currency amount if rates are temporarily unavailable.
        }
      }
      atomicGoalContribution = {
        goalId: goalContribution.goalId,
        amount: contribAmount,
        currency: goalCurrency,
        month: /^\d{4}-\d{2}/.test(form.date) ? form.date.slice(0, 7) : currentMonth,
      };
    }
    update.mutate({
      id: txId,
      mode: "form",
      autoPrompt: wasAutoAssigned && overriddenMerchant && overriddenCategoryName
        ? { merchantName: overriddenMerchant, oldCategoryName: overriddenCategoryName }
        : undefined,
      data: {
        amount: parseFloat(form.amount),
        description: form.description,
        categoryId,
        date: form.date,
        paymentMethod: form.paymentMethod,
        goalContribution: atomicGoalContribution,
        larderAmount: nowHasLarder ? larderAmount : null,
        larderCurrency: nowHasLarder ? prefs.currency : null,
      },
    });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("tx.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScreenshotOpen(true)} data-testid="button-import-screenshot" className="gap-2" disabled={!isOnline}>
            <ScanLine className="w-4 h-4" /> {t("tx.import_screenshot")}
          </Button>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction" className="gap-2">
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
                          {(tx.receiptImage || (Array.isArray(tx.receiptImages) && tx.receiptImages.length > 0)) && (
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
                  key={editTx.id}
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
        <ReceiptManager
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
