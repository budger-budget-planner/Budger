import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { t } from "@/lib/i18n";
import { compressImage } from "@/lib/imageUtils";
import { playSniffSound, primeSniffAudio, SNIFF_4_OFFSET_MS } from "@/lib/badger-notify";
import { CURRENCIES } from "@/lib/prefs";
import { enqueue } from "@/lib/mutation-queue";
import { useExtractScreenshotTransactions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BadgerLogo from "@/components/BadgerLogo";
import { Image, Check } from "lucide-react";

// ── Import scope ─────────────────────────────────────────────────────────────
type ImportScope = "all" | "current_month";
const SCOPE_KEY = "budger_import_scope_v1";
function loadScope(): ImportScope {
  try {
    const v = localStorage.getItem(SCOPE_KEY);
    if (v === "current_month") return "current_month";
  } catch { /**/ }
  return "all";
}
function saveScope(s: ImportScope) {
  try { localStorage.setItem(SCOPE_KEY, s); } catch { /**/ }
}

/** Returns yyyy-MM prefix for the current month, e.g. "2026-07" */
function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type ExtractedRow = {
  merchant: string;
  amount: string;
  currency: string;
  date: string; // stored internally as ISO yyyy-MM-dd
  selected: boolean;
};

// ── DD.MM.YYYY <-> yyyy-MM-dd helpers ───────────────────────────────────────
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
  budgerName,
  onBudgerNameSave,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  budgerName?: string | null;
  onBudgerNameSave?: (name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ExtractedRow[] | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [scope, setScopeState] = useState<ImportScope>(loadScope);
  const [outOfMonthDeselected, setOutOfMonthDeselected] = useState(false);

  // ── Budger naming — synced from prop, saved on blur / Enter ──────────────
  const [nameInput, setNameInput] = useState(budgerName ?? "");
  useEffect(() => { setNameInput(budgerName ?? ""); }, [budgerName]);
  function handleNameSave() {
    const trimmed = nameInput.trim();
    if (trimmed !== (budgerName ?? "")) onBudgerNameSave?.(trimmed);
  }

  // transitioning = scan complete but we're waiting for sniff 4 before revealing results
  const [transitioning, setTransitioning] = useState(false);
  // badgerExiting = results are visible; badger briefly overlays and shrinks away
  const [badgerExiting, setBadgerExiting] = useState(false);

  const extract = useExtractScreenshotTransactions();
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Incremented on every new scan and on every close/reset. Callbacks capture
  // the token at launch and bail out if it no longer matches — prevents stale
  // in-flight requests from polluting a freshly-opened dialog session.
  const sessionTokenRef = useRef(0);

  function setScope(s: ImportScope) {
    setScopeState(s);
    saveScope(s);
  }

  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  // Loop the sniff animation tick while scanning or in transition hold
  const [sniffTick, setSniffTick] = useState(0);
  const isSniffing = extract.isPending || transitioning;
  useEffect(() => {
    if (!isSniffing) return;
    const interval = setInterval(() => setSniffTick(n => n + 1), 1550);
    return () => clearInterval(interval);
  }, [isSniffing]);

  // Clear any pending transition timers on unmount
  useEffect(() => {
    return () => { transitionTimersRef.current.forEach(clearTimeout); };
  }, []);

  function reset() {
    sessionTokenRef.current += 1; // invalidate any in-flight callbacks
    transitionTimersRef.current.forEach(clearTimeout);
    transitionTimersRef.current = [];
    setRows(null);
    setDateDrafts({});
    setError(null);
    setImporting(false);
    setOutOfMonthDeselected(false);
    setTransitioning(false);
    setBadgerExiting(false);
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
    // Unlock/warm the sniff AudioContext synchronously here, still inside the
    // gesture call stack for this change event — the extraction below is an
    // async network round-trip, so priming later would run outside any user
    // gesture and mobile browsers would silently refuse to resume playback.
    primeSniffAudio();
    // Capture session at scan start; incremented by reset() so stale callbacks
    // from a previous session are silently discarded.
    sessionTokenRef.current += 1;
    const mySession = sessionTokenRef.current;
    try {
      // PDFs are sent as-is (base64 data URL); images are compressed first.
      const imageData = file.type === "application/pdf"
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read PDF"));
            reader.readAsDataURL(file);
          })
        : await compressImage(file, 1600, 0.85);
      extract.mutate(
        { data: { imageData } },
        {
          onSuccess: (result) => {
            // Discard if the dialog was closed/reset after this scan began
            if (!openRef.current || sessionTokenRef.current !== mySession) return;

            const activeScope = loadScope();
            const monthPrefix = currentMonthPrefix();
            let anyDeselected = false;
            const processed = result.transactions.map(tx => {
              const date = tx.date ?? format(new Date(), "yyyy-MM-dd");
              const inCurrentMonth = date.startsWith(monthPrefix);
              const selected = activeScope === "current_month" ? inCurrentMonth : true;
              if (!selected) anyDeselected = true;
              return {
                merchant: tx.merchant,
                amount: String(Math.abs(tx.amount)),
                currency: (tx.currency ?? "").toUpperCase(),
                date,
                selected,
              };
            });

            setOutOfMonthDeselected(anyDeselected);

            // Play the sniff sound as the loading → results transition.
            // The page flips exactly on sniff 4 (SNIFF_4_OFFSET_MS ms in);
            // the badger then exit-animates out of the results view.
            playSniffSound();
            setTransitioning(true);

            // Clear any existing timers before scheduling new ones — prevents
            // cross-callback races if onSuccess fires more than once.
            transitionTimersRef.current.forEach(clearTimeout);

            const t1 = setTimeout(() => {
              if (sessionTokenRef.current !== mySession) return;
              setRows(processed);
              setDateDrafts({});
              setTransitioning(false);
              setBadgerExiting(true);
            }, SNIFF_4_OFFSET_MS);

            // Give the exit animation time to complete before removing the node
            const t2 = setTimeout(() => {
              if (sessionTokenRef.current !== mySession) return;
              setBadgerExiting(false);
            }, SNIFF_4_OFFSET_MS + 450);

            transitionTimersRef.current = [t1, t2];
          },
          onError: (err: unknown) => {
            if (!openRef.current || sessionTokenRef.current !== mySession) return;
            // Prefer the server's own error message (ApiError.data.error) so
            // specific cases like rate-limit 429s surface clearly to the user.
            const serverMsg = (err as any)?.data?.error;
            setError(typeof serverMsg === "string" ? serverMsg : t("tx.screenshot_error"));
          },
        },
      );
    } catch {
      if (sessionTokenRef.current === mySession) setError(t("tx.screenshot_error"));
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
        window.dispatchEvent(new CustomEvent("queue-drain"));
        window.dispatchEvent(new CustomEvent("queue-updated"));
        onImported();
      }

      if (failedIdxs.length === 0) {
        handleClose();
      } else {
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
  const hasInvalidSelectedDate = (rows ?? []).some((row, i) => {
    if (!row.selected) return false;
    const draft = dateDrafts[i] ?? isoToDisplayDate(row.date);
    return displayToIsoDate(draft) === null;
  });

  return (
    <>
      {/* ── Animation keyframes ─────────────────────────────────────────── */}
      <style>{`
        @keyframes sid-grow {
          0%, 100% { transform: scale(1); }
          40%, 60% { transform: scale(1.18); }
        }
        @keyframes sid-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0px); }
          40%            { opacity: 1;    transform: translateY(-5px); }
        }
        @keyframes sid-text-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0px); }
        }
        @keyframes sid-badger-exit {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(0.12); opacity: 0; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>

          {/* ── Sniffing / transition hold screen ───────────────────────── */}
          {isSniffing && (
            <div className="flex flex-col items-center gap-5 py-10">
              {/* Growing badger — scale pulses on the same 1.55 s sniff cycle */}
              <div style={{ animation: "sid-grow 1.55s ease-in-out infinite", display: "inline-block" }}>
                <BadgerLogo
                  key={sniffTick}
                  size={96}
                  forceAnim="sniff"
                />
              </div>

              {/* "[Name] is sniffing…" — fades+slides in fresh each cycle */}
              <p
                key={`label-${sniffTick}`}
                className="text-base font-semibold tracking-wide text-foreground"
                style={{ animation: "sid-text-in 0.35s ease-out forwards" }}
              >
                {budgerName ? `${budgerName} is sniffing…` : t("tx.sniffing_label")}
              </p>

              {/* Bouncing dots loading indicator */}
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="text-muted-foreground"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: "currentColor",
                      display: "inline-block",
                      animation: "sid-dot 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Idle (no scan, no results) ──────────────────────────────── */}
          {!rows && !isSniffing && (
            <div className="flex flex-col gap-6 pt-3 pb-2">
              <div className="flex flex-col items-center gap-2 pt-2">
                <BadgerLogo size={96} />
                {/* Subtle name field — a little secret for curious eyes */}
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  placeholder="give me a name…"
                  maxLength={24}
                  className="w-36 text-xs text-center bg-transparent outline-none
                             text-muted-foreground/60 placeholder:text-muted-foreground/25
                             border-b border-transparent focus:border-border/50
                             transition-colors duration-300 pb-0.5"
                />
              </div>

              <p className="text-sm text-muted-foreground text-center leading-relaxed px-1">
                {t("tx.import_screenshot_hint")}
              </p>

              {/* Import scope toggle */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("tx.import_scope_label")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["all", "current_month"] as ImportScope[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        scope === s
                          ? "bg-foreground text-background border-foreground"
                          : "bg-muted/40 text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {s === "all" ? t("tx.import_all") : t("tx.import_current_month")}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                <Image className="w-4 h-4" />
                {t("tx.choose_screenshot")}
              </Button>

              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-screenshot-import"
              />
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────────── */}
          {rows && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("tx.import_screenshot_review", { count: rows.length })}
              </p>

              <p className="text-xs text-muted-foreground bg-muted/60 rounded-xl px-3 py-2 leading-snug">
                {t("tx.import_review_disclaimer")}
              </p>

              {outOfMonthDeselected && (
                <p className="text-xs text-muted-foreground bg-muted/60 rounded-xl px-3 py-2 leading-snug">
                  {t("tx.import_current_month_hint")}
                </p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {rows.map((row, i) => {
                  const dateText = dateDrafts[i] ?? isoToDisplayDate(row.date);
                  const dateValid = displayToIsoDate(dateText) !== null;
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
                <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                  {t("common.cancel")}
                </Button>
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

      {/* Badger exit overlay — rendered outside the dialog so the animation
          isn't clipped by the scroll container. Fires once when results land,
          plays the shrink+fade, then removes itself after 450 ms. */}
      {badgerExiting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            pointerEvents: "none",
            animation: "sid-badger-exit 0.38s cubic-bezier(0.4, 0, 1, 1) forwards",
          }}
        >
          <BadgerLogo size={96} />
        </div>
      )}
    </>
  );
}
