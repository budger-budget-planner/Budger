import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { t } from "@/lib/i18n";
import { compressImage } from "@/lib/imageUtils";
import { playSniffSound } from "@/lib/badger-notify";
import { CURRENCIES } from "@/lib/prefs";
import { enqueue } from "@/lib/mutation-queue";
import { useExtractScreenshotTransactions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BadgerLogo from "@/components/BadgerLogo";
import { Image, Check } from "lucide-react";

export type ExtractedRow = {
  merchant: string;
  amount: string;
  currency: string;
  date: string; // stored internally as ISO yyyy-MM-dd
  selected: boolean;
};

// ── DD.MM.YYYY <-> yyyy-MM-dd helpers ───────────────────────────────────────
// The native <input type="date"> calendar never localizes month abbreviations
// to Polish, so dates are edited as plain DD.MM.YYYY text instead.
function isoToDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function displayToIsoDate(display: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject calendar-impossible dates (e.g. 31.02, 29.02 on a non-leap year) by
  // round-tripping through a real Date and checking the components survived —
  // JS Date silently rolls invalid days/months over into the next month otherwise.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
  // Free-text draft for each row's date field, keyed by row index — lets the
  // user type digits/dots freely without every keystroke needing to already
  // form a valid date. Falls back to the row's ISO date (formatted) when untouched.
  const [dateDrafts, setDateDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const extract = useExtractScreenshotTransactions();

  // Tracks whether the dialog is still open when an in-flight extraction resolves —
  // the mutation can't be cancelled, so without this guard closing mid-scan and
  // reopening later would silently repopulate rows and play the sniff sound.
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  // Loop the badger's sniff animation for as long as the AI is reading the screenshot —
  // the underlying CSS animation runs once per mount, so we remount it on a tick.
  const [sniffTick, setSniffTick] = useState(0);
  useEffect(() => {
    if (!extract.isPending) return;
    const interval = setInterval(() => setSniffTick(n => n + 1), 1550);
    return () => clearInterval(interval);
  }, [extract.isPending]);

  function reset() {
    setRows(null);
    setDateDrafts({});
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
            // The dialog may have been closed while the request was in flight —
            // don't repopulate rows or play sound into a dialog the user already left.
            if (!openRef.current) return;
            setRows(
              result.transactions.map(tx => ({
                merchant: tx.merchant,
                // Banking apps show expenses as negative amounts (e.g. -136.02 PLN).
                // Budger stores all transactions as positive values, so we always
                // take the absolute value here — the user can correct the number in
                // the review step if needed.
                amount: String(Math.abs(tx.amount)),
                currency: (tx.currency ?? "").toUpperCase(),
                date: tx.date ?? format(new Date(), "yyyy-MM-dd"),
                selected: true,
              })),
            );
            setDateDrafts({});
            // Let the user know the badger finished reading the screenshot.
            playSniffSound();
          },
          onError: () => { if (openRef.current) setError(t("tx.screenshot_error")); },
        },
      );
    } catch {
      setError(t("tx.image_error"));
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedRow>) {
    setRows(prev => prev ? prev.map((r, idx) => idx === i ? { ...r, ...patch } : r) : prev);
  }

  function handleDateDraftChange(i: number, text: string) {
    setDateDrafts(prev => ({ ...prev, [i]: text }));
    const iso = displayToIsoDate(text);
    if (iso) updateRow(i, { date: iso });
  }

  async function handleImport() {
    if (!rows) return;
    const selected = rows.filter(r => r.selected && r.merchant.trim() && parseFloat(r.amount) > 0);
    if (selected.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      // Enqueue all selected transactions into the offline mutation queue rather
      // than posting directly.  Benefits:
      //   • They appear immediately as "pending sync" in the NC Settings tab.
      //   • The existing drain handles retries, ordering, and query refresh.
      //   • The dialog can close right away without waiting for the network.
      //
      // Use allSettled so a single IDB failure doesn't silently discard the rest.
      const results = await Promise.allSettled(
        selected.map(row =>
          enqueue({
            endpoint: `${import.meta.env.BASE_URL}api/transactions`,
            method: "POST",
            payload: {
              amount: parseFloat(row.amount),
              description: row.merchant.trim(),
              date: row.date,
              paymentMethod: "apple_pay",
              transactionCurrency: row.currency || null,
            },
          }),
        ),
      );

      const failedIdxs = results
        .map((r, i) => (r.status === "rejected" ? i : null))
        .filter((i): i is number => i !== null);
      const enqueuedCount = results.length - failedIdxs.length;

      if (enqueuedCount > 0) {
        // Kick off an immediate drain — the drainPending flag in useQueueReplay
        // ensures ops enqueued during an already-running drain aren't missed.
        window.dispatchEvent(new CustomEvent("queue-drain"));
        window.dispatchEvent(new CustomEvent("queue-updated"));
        onImported();
      }

      if (failedIdxs.length === 0) {
        handleClose();
      } else {
        // Keep only the rows that couldn't be queued so the user can retry
        // without re-submitting successfully-queued ones.
        setRows(selected.filter((_, i) => failedIdxs.includes(i)));
        setDateDrafts({});
        setError(t("tx.import_failed_error"));
      }
    } catch {
      setError(t("tx.import_failed_error"));
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows?.filter(r => r.selected).length ?? 0;
  // Block import while any *selected* row's date field is mid-edit into something
  // invalid — otherwise the stale last-valid ISO date would be submitted silently.
  const hasInvalidSelectedDate = (rows ?? []).some((row, i) => {
    if (!row.selected) return false;
    const draft = dateDrafts[i] ?? isoToDisplayDate(row.date);
    return displayToIsoDate(draft) === null;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("tx.import_screenshot")}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center">
          <BadgerLogo
            key={extract.isPending ? sniffTick : "idle"}
            size={72}
            forceAnim={extract.isPending ? "sniff" : undefined}
          />
        </div>

        {!rows && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("tx.import_screenshot_hint")}</p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {extract.isPending ? (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
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
              {rows.map((row, i) => {
                const dateText = dateDrafts[i] ?? isoToDisplayDate(row.date);
                const dateValid = displayToIsoDate(dateText) !== null;
                // Some currencies extracted from a screenshot may not be one of the
                // app's usual set — keep it selectable rather than silently dropping it.
                const currencyOptions = CURRENCIES.some(c => c.code === row.currency)
                  ? CURRENCIES
                  : row.currency
                    ? [...CURRENCIES, { code: row.currency, label: row.currency, symbol: "" }]
                    : CURRENCIES;

                return (
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
                      <Select
                        value={row.currency || undefined}
                        onValueChange={(v) => updateRow(i, { currency: v })}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid={`select-import-currency-${i}`}>
                          <SelectValue placeholder={t("profile.currency")} />
                        </SelectTrigger>
                        <SelectContent>
                          {currencyOptions.map(c => (
                            <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={dateText}
                        onChange={e => handleDateDraftChange(i, e.target.value)}
                        className={`h-8 text-sm ${!dateValid ? "border-destructive" : ""}`}
                        placeholder="DD.MM.YYYY"
                        maxLength={10}
                        data-testid={`input-import-date-${i}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>{t("common.cancel")}</Button>
              <Button
                type="button"
                className="flex-1"
                disabled={importing || selectedCount === 0 || hasInvalidSelectedDate}
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
