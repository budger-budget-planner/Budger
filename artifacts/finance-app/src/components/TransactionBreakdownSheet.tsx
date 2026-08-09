import { useEffect, useMemo, useState } from "react";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { fmtAmt } from "@/lib/prefs";
import {
  useBreakdownTransaction,
  type BreakdownTransactionInput,
  type Transaction,
} from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BreakdownRow = {
  id: string;
  description: string;
  amount: string;
  categoryId: string;
};

type Props = {
  tx: Transaction | any;
  categories: any[];
  accountCurrency: string;
  open: boolean;
  isOnline: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onFailure?: () => void;
};

function makeRow(index: number, description = "", amount = "", categoryId = "none"): BreakdownRow {
  return { id: `breakdown-${Date.now()}-${index}`, description, amount, categoryId };
}

function parseCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(`${whole}${decimal.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function centsLabel(cents: number, currency: string): string {
  return fmtAmt(Math.max(0, cents) / 100, currency);
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const data = error.data;
  return data && typeof data === "object" && "error" in data
    ? String((data as { error: unknown }).error)
    : null;
}

export function TransactionBreakdownSheet({ tx, categories, accountCurrency, open, isOnline, onClose, onSuccess, onFailure }: Props) {
  const sourceCents = Math.round(Number(tx.amount) * 100);
  const currency = accountCurrency;
  const [rows, setRows] = useState<BreakdownRow[]>(() => [
    makeRow(0),
    makeRow(1),
  ]);
  const breakdown = useBreakdownTransaction();

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("breakdown-open");
    window.getSelection()?.removeAllRanges();
    setRows([
      makeRow(0),
      makeRow(1),
    ]);
    return () => {
      document.documentElement.classList.remove("breakdown-open");
      window.getSelection()?.removeAllRanges();
    };
  }, [open, tx.id]);

  const allocation = useMemo(() => {
    const parsed = rows.map(row => parseCents(row.amount));
    const allocatedCents = parsed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const remainingCents = sourceCents - allocatedCents;
    const invalidRows = rows.some((row, index) => !row.description.trim() || parsed[index] === null);
    return {
      parsed,
      allocatedCents,
      remainingCents,
      overCents: Math.max(0, -remainingCents),
      invalidRows,
      exactlyAllocated: remainingCents === 0,
    };
  }, [rows, sourceCents]);

  function updateRow(id: string, patch: Partial<BreakdownRow>) {
    setRows(current => {
      const next = current.map(row => row.id === id ? { ...row, ...patch } : row);
      return next;
    });
  }

  function addRow() {
    setRows(current => [...current, makeRow(current.length)]);
  }

  function removeRow(id: string) {
    setRows(current => current.filter(row => row.id !== id));
  }

  function fieldError(row: BreakdownRow, index: number): string | null {
    if (!row.description.trim()) return t("breakdown.name_required");
    const parsed = allocation.parsed[index];
    if (row.amount.trim() === "") return t("breakdown.amount_required");
    if (parsed === null) return t("breakdown.amount_invalid");
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isOnline || breakdown.isPending || allocation.invalidRows || !allocation.exactlyAllocated) return;
    const data: BreakdownTransactionInput = {
      rows: rows.map((row, index) => ({
        description: row.description.trim(),
        amount: allocation.parsed[index]! / 100,
        categoryId: row.categoryId === "none" ? null : Number(row.categoryId),
      })),
    };
    try {
      await breakdown.mutateAsync({ id: tx.id, data });
      toast.success(t("breakdown.success"));
      onSuccess();
    } catch (error) {
      onFailure?.();
      const code = errorCode(error);
      const message = code === "breakdown_source_not_found"
        ? t("breakdown.source_missing")
        : code === "breakdown_source_ineligible"
        ? t("breakdown.unavailable")
        : code === "breakdown_total_mismatch"
        ? t("breakdown.total_mismatch")
        : code === "breakdown_category_unavailable"
        ? t("breakdown.category_unavailable")
        : !isOnline ? t("breakdown.offline") : t("breakdown.failed");
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent
        className="breakdown-sheet-no-selection max-w-lg max-h-[92vh] overflow-y-auto"
        onOpenAutoFocus={event => event.preventDefault()}
        onContextMenu={event => event.preventDefault()}
      >
        <DialogHeader className="pr-7">
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-white/60" />
            {t("breakdown.title")}
          </DialogTitle>
          <DialogDescription>
            {t("breakdown.original", { desc: tx.description, date: tx.date, amount: centsLabel(sourceCents, currency) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
            {t("breakdown.receipt_discarded")}
          </div>
          <div className="space-y-3">
            {rows.map((row, index) => {
              const error = fieldError(row, index);
              const otherCents = allocation.allocatedCents - (allocation.parsed[index] ?? 0);
              const maxCents = Math.max(0, sourceCents - otherCents);
              return (
                <div key={row.id} className="rounded-2xl border border-white/10 bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/45">{index + 1}</span>
                    {rows.length > 2 && (
                      <button type="button" aria-label={t("breakdown.remove_row")} onClick={() => removeRow(row.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/45 hover:text-white active:bg-white/10">
                        <Trash2 className="w-3 h-3" />{t("breakdown.remove")}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${row.id}-description`}>{t("breakdown.name")}</Label>
                    <Input id={`${row.id}-description`} value={row.description} onChange={event => updateRow(row.id, { description: event.target.value })} placeholder={t("breakdown.name_placeholder")} aria-invalid={!!error && !row.description.trim()} autoComplete="off" />
                  </div>
                  <div className="grid grid-cols-[1fr_1.2fr] gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${row.id}-amount`}>{t("common.amount")}</Label>
                      <Input id={`${row.id}-amount`} value={row.amount} onChange={event => updateRow(row.id, { amount: event.target.value })} inputMode="decimal" placeholder="0.00" aria-invalid={!!error && (!!row.amount.trim() || !row.description.trim())} className={allocation.overCents > 0 ? "border-red-500/70 focus-visible:ring-red-500/50" : ""} />
                      <p className="text-[11px] text-white/40 whitespace-nowrap">{t("breakdown.max_amount", { amount: centsLabel(maxCents, currency) })}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${row.id}-category`}>{t("breakdown.category")}</Label>
                      <Select value={row.categoryId} onValueChange={categoryId => updateRow(row.id, { categoryId })}>
                        <SelectTrigger id={`${row.id}-category`} aria-label={t("breakdown.category")}><SelectValue placeholder={t("home.no_category")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("home.no_category")}</SelectItem>
                          {categories.map(category => (
                            <SelectItem key={category.id} value={String(category.id)}>
                              <span className="inline-flex items-center gap-2 max-w-[190px]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate">{category.name}</span></span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addRow} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-white/65 hover:text-white hover:border-white/40 active:bg-white/10">
            <Plus className="w-4 h-4" />{t("breakdown.add_row")}
          </button>
          <div className={`rounded-2xl border px-3 py-3 space-y-1 ${
            allocation.overCents > 0
              ? "border-red-500/60 bg-red-500/10"
              : allocation.remainingCents > 0
              ? "border-amber-500/60 bg-amber-500/10"
              : "border-white/10 bg-white/[0.03]"
          }`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/55">{t("breakdown.allocated")}</span>
              <span className="font-semibold">{centsLabel(allocation.allocatedCents, currency)} / {centsLabel(sourceCents, currency)}</span>
            </div>
            {allocation.overCents > 0 ? <p className="text-xs text-red-300" role="alert">{t("breakdown.over", { amount: centsLabel(allocation.overCents, currency) })}</p>
              : allocation.remainingCents > 0 ? <p className="text-xs text-amber-300" role="status">{t("breakdown.remaining", { amount: centsLabel(allocation.remainingCents, currency) })}</p> : null}
          </div>
          {!isOnline && <p className="text-xs text-amber-300" role="alert">{t("breakdown.offline")}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" className="flex-1" disabled={!isOnline || breakdown.isPending || allocation.invalidRows || !allocation.exactlyAllocated}>
              {breakdown.isPending ? t("breakdown.submitting") : t("breakdown.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
