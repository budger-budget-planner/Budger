import { useRef, useState } from "react";
import { format } from "date-fns";
import { t } from "@/lib/i18n";
import { compressImage } from "@/lib/imageUtils";
import { useExtractScreenshotTransactions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image, Loader2, Check } from "lucide-react";

export type ExtractedRow = {
  merchant: string;
  amount: string;
  currency: string;
  date: string;
  selected: boolean;
};

/**
 * Shared "scan a screenshot" AI-import flow — lets the user pick an image of a
 * transaction list/receipt, extracts candidate rows via AI, and lets them
 * review/edit before importing. Used from both the Transactions page toolbar
 * and the global header (badger logo tap), so it must not depend on
 * page-local state.
 */
export function ScreenshotImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ExtractedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const extract = useExtractScreenshotTransactions();

  function reset() {
    setRows(null);
    setError(null);
    setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);
    try {
      // Higher resolution than receipt compression — the model needs to read small text.
      const imageData = await compressImage(file, 1600, 0.85);
      extract.mutate(
        { data: { imageData } },
        {
          onSuccess: (result) => {
            setRows(
              result.transactions.map(tx => ({
                merchant: tx.merchant,
                amount: String(tx.amount),
                currency: (tx.currency ?? "").toUpperCase(),
                date: tx.date ?? format(new Date(), "yyyy-MM-dd"),
                selected: true,
              })),
            );
          },
          onError: () => setError(t("tx.screenshot_error")),
        },
      );
    } catch {
      setError(t("tx.image_error"));
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedRow>) {
    setRows(prev => prev ? prev.map((r, idx) => idx === i ? { ...r, ...patch } : r) : prev);
  }

  async function handleImport() {
    if (!rows) return;
    const selected = rows.filter(r => r.selected && r.merchant.trim() && parseFloat(r.amount) > 0);
    if (selected.length === 0) return;
    setImporting(true);
    setError(null);
    const failedRows: ExtractedRow[] = [];
    let succeeded = 0;
    try {
      for (const row of selected) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}api/transactions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: parseFloat(row.amount),
              description: row.merchant.trim(),
              date: row.date,
              paymentMethod: "apple_pay",
              transactionCurrency: row.currency || null,
            }),
          });
          if (res.ok) {
            succeeded++;
          } else {
            failedRows.push(row);
          }
        } catch {
          failedRows.push(row);
        }
      }
    } finally {
      setImporting(false);
    }

    if (succeeded > 0) {
      onImported();
    }
    if (failedRows.length === 0) {
      handleClose();
    } else {
      // Keep the dialog open with only the rows that failed to save so the user
      // can retry, instead of losing their edits or wrongly believing everything saved.
      setRows(failedRows);
      setError(
        succeeded > 0
          ? t("tx.import_partial_error", { succeeded, failed: failedRows.length })
          : t("tx.import_failed_error"),
      );
    }
  }

  const selectedCount = rows?.filter(r => r.selected).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("tx.import_screenshot")}</DialogTitle>
        </DialogHeader>

        {!rows && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("tx.import_screenshot_hint")}</p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {extract.isPending ? (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">{t("tx.import_screenshot_analyzing")}</p>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                <Image className="w-4 h-4" />
                {t("tx.choose_screenshot")}
              </Button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-screenshot-import"
            />
          </div>
        )}

        {rows && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("tx.import_screenshot_review", { count: rows.length })}
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.map((row, i) => (
                <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateRow(i, { selected: !row.selected })}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${row.selected ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}
                      data-testid={`checkbox-import-row-${i}`}
                    >
                      {row.selected && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <Input
                      value={row.merchant}
                      onChange={e => updateRow(i, { merchant: e.target.value })}
                      className="flex-1 h-8 text-sm"
                      placeholder={t("home.description")}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pl-7">
                    <Input
                      type="number" step="0.01" min="0"
                      value={row.amount}
                      onChange={e => updateRow(i, { amount: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="0.00"
                    />
                    <Input
                      value={row.currency}
                      onChange={e => updateRow(i, { currency: e.target.value.toUpperCase() })}
                      className="h-8 text-sm"
                      placeholder="PLN"
                      maxLength={3}
                    />
                    <Input
                      type="date"
                      value={row.date}
                      onChange={e => updateRow(i, { date: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>{t("common.cancel")}</Button>
              <Button
                type="button"
                className="flex-1"
                disabled={importing || selectedCount === 0}
                onClick={handleImport}
                data-testid="button-confirm-import"
              >
                {importing ? t("common.saving") : t("tx.import_count", { count: selectedCount })}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
