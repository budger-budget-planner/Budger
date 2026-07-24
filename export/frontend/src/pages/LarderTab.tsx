import { forwardRef, useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListGoals, useGetMe, useGetGoalsSummary, getListGoalsQueryKey, getGetGoalsSummaryQueryKey, getGetLarderQueryKey } from "@/lib/api-client";
import { loadPrefs, currencySymbol, fmtAmt, AppPrefs } from "@/lib/prefs";
import { AmtHero } from "@/components/AmtHero";
import { fetchRates, convertAmount } from "@/lib/rates";
import { useToast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue, requestBackgroundSync } from "@/lib/mutation-queue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Warehouse, PiggyBank, Target, TrendingUp, TrendingDown,
  ArrowRightCircle, X, ChevronDown, ChevronUp, Trash2, Users, Plus,
} from "lucide-react";

type LarderEntry = {
  id: number;
  userId: number;
  amount: number;
  currency: string;
  sourceType: string;
  sourceId: number | null;
  goalId: number | null;
  note: string | null;
  createdAt: string;
};

type CurrencySubtotal = {
  currency: string;
  rawTotal: number;
};

type LarderSummary = {
  total: number;
  currency: string;
  entries: LarderEntry[];
  glPercent: number | null;
  glRuleSynced: number;
  currencyBreakdown?: CurrencySubtotal[];
};

/** Order breakdown items: account currency first, then language-based order. */
function orderedBreakdown(
  breakdown: CurrencySubtotal[],
  accountCurrency: string,
  language: string
): CurrencySubtotal[] {
  const langOrder = language === "pl"
    ? ["PLN", "EUR", "USD", "GBP"]
    : ["EUR", "USD", "GBP", "PLN"];
  const nonZero = breakdown.filter(b => Math.abs(b.rawTotal) >= 0.005);
  const acct = nonZero.find(b => b.currency === accountCurrency);
  const rest = nonZero
    .filter(b => b.currency !== accountCurrency)
    .sort((a, b) => {
      const ai = langOrder.indexOf(a.currency);
      const bi = langOrder.indexOf(b.currency);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  return acct ? [acct, ...rest] : rest;
}

/** Currencies with a usable (>0) balance, for the "Asset" source-of-funds dropdown. */
function assetOptions(breakdown: CurrencySubtotal[]): CurrencySubtotal[] {
  return breakdown.filter(b => b.rawTotal > 0.005);
}

function AssetSelect({
  options, value, onChange,
}: { options: CurrencySubtotal[]; value: string; onChange: (v: string) => void }) {
  if (options.length === 0) return null;
  const locked = options.length === 1;
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>{t("larder.asset_label")}</label>
      <div className="space-y-2">
        {options.map(o => {
          const isActive = !locked && value === o.currency;
          return locked ? (
            <div
              key={o.currency}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/6 bg-white/3 opacity-40 cursor-default select-none"
            >
              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white/50 leading-none">{o.currency[0]}</span>
              </div>
              <p className="text-sm text-white/40">{o.currency} · {fmtAmt(o.rawTotal, o.currency)}</p>
            </div>
          ) : (
            <button
              key={o.currency}
              type="button"
              onClick={() => onChange(o.currency)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
                isActive ? "border-white/40 bg-white/10" : "border-white/10 bg-white/3"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-white/60 leading-none">{o.currency[0]}</span>
              </div>
              <p className="text-sm font-medium truncate text-left text-white/80">{o.currency} · {fmtAmt(o.rawTotal, o.currency)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small "≈ 12.50 USD" preview when the asset currency differs from the account currency. */
function ConversionPreview({
  amount, from, to, rates,
}: { amount: number; from: string; to: string; rates: Record<string, number> | undefined }) {
  if (!rates || !from || from === to || isNaN(amount) || amount <= 0) return null;
  const converted = convertAmount(amount, from, to, rates);
  return (
    <p className="text-xs text-white/35 tabular-nums">
      ≈ {fmtAmt(converted, to)}
    </p>
  );
}

function sourceLabel(sourceType: string): string {
  if (sourceType === "recurring_payment") return t("larder.source_recurring");
  if (sourceType === "larder_fund")       return t("larder.source_fund");
  if (sourceType === "larder_spend")      return t("larder.source_fund");
  if (sourceType === "goal_dedication")   return t("larder.source_dedication");
  if (sourceType === "great_larder_transfer") return t("larder.source_transfer");
  return t("larder.source_manual");
}

function EntryIcon({ sourceType, positive }: { sourceType: string; positive: boolean }) {
  if (sourceType === "recurring_payment") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (sourceType === "larder_fund")       return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (sourceType === "larder_spend")      return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  if (sourceType === "goal_dedication")   return <Target className="w-3.5 h-3.5 text-white/40" />;
  if (sourceType === "great_larder_transfer") return <ArrowRightCircle className="w-3.5 h-3.5 text-white/40" />;
  return positive
    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
    : <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
}

function Sheet({
  title, open, onClose, children,
}: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-[#111] border-t border-white/10 rounded-t-3xl px-5 pt-6 pb-10 max-h-[88vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <p className="text-lg font-bold text-white">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center transition active:scale-95">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

const inputCls = "w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-white/25";
const labelCls = "text-xs text-white/40 font-medium";

const LarderCard = forwardRef<HTMLDivElement, { revealed?: boolean }>(({ revealed = false }, ref) => {
  const prefs = loadPrefs();
  const noAnim = prefs.disableAnimations;
  const sym = currencySymbol(prefs.currency);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const { data: larder } = useQuery<LarderSummary>({
    queryKey: ["larder"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load Larder");
      return r.json();
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: goals } = useListGoals({ query: { retry: false } } as any);
  const { data: goalSummaries } = useGetGoalsSummary({}, { query: { retry: false } } as any);
  const { data: rates } = useQuery({ queryKey: ["fx-rates"], queryFn: fetchRates, staleTime: 60 * 60 * 1000 });

  const [dedicateOpen, setDedicateOpen] = useState(false);
  const [historyOpen,       setHistoryOpen]       = useState(false);
  const [showClearConfirm,  setShowClearConfirm]  = useState(false);
  const [clearIncludeTransfers, setClearIncludeTransfers] = useState(false);
  const [glBadgeCollapsed, setGlBadgeCollapsed] = useState(true);

  // ── GL badge dismiss (long-press to reset the counter) ───────────────────────
  // Stores the totalGLSent value at the time of last dismissal so the badge only
  // shows the DELTA since then. New sends reappear; old ones are acknowledged.
  // Key is namespaced by userId so account-switching doesn't bleed stale state.
  const [glDismissedAmount, setGlDismissedAmount] = useState<number>(0);
  const glLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glWasLongPress   = useRef(false);
  useEffect(() => () => { if (glLongPressTimer.current) clearTimeout(glLongPressTimer.current); }, []);

  // ── GL badge hint animation ──────────────────────────────────────────────────
  // When the badge is expanded: after 1 s show a "press & hold to reset" hint for
  // 1.5 s, then hide it. First-ever expand loops the cycle every 4 s after hiding;
  // any re-expand (after the user has collapsed it) plays the hint once only.
  const [hintVisible,    setHintVisible]    = useState(false);
  const hintTimers      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hintLoopEnabled = useRef(true); // true = loop; flips false after first collapse

  function clearHintTimers() {
    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];
  }

  function scheduleHint(loop: boolean) {
    clearHintTimers();
    const t1 = setTimeout(() => {
      setHintVisible(true);
      const t2 = setTimeout(() => {
        setHintVisible(false);
        if (loop) {
          const t3 = setTimeout(() => scheduleHint(true), 4000);
          hintTimers.current.push(t3);
        }
      }, 1500);
      hintTimers.current.push(t2);
    }, 1000);
    hintTimers.current.push(t1);
  }

  // Watch badge collapse/expand to drive the hint schedule.
  useEffect(() => {
    if (!glBadgeCollapsed) {
      scheduleHint(hintLoopEnabled.current);
      hintLoopEnabled.current = false; // all future re-opens are one-shot
    } else {
      clearHintTimers();
      setHintVisible(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glBadgeCollapsed]);

  useEffect(() => () => clearHintTimers(), []);

  const [spendOpen,    setSpendOpen]    = useState(false);
  const [spendDesc,    setSpendDesc]    = useState("");
  const [spendAmt,     setSpendAmt]     = useState("");
  const [spendAsset,   setSpendAsset]   = useState("");
  const [spendLoading, setSpendLoading] = useState(false);

  const [sendGlOpen,    setSendGlOpen]    = useState(false);
  const [sendGlMode,    setSendGlMode]    = useState<"amount" | "percent">("amount");
  const [sendGlAmt,     setSendGlAmt]     = useState("");
  const [sendGlPct,     setSendGlPct]     = useState("");
  const [sendGlAsset,   setSendGlAsset]   = useState("");
  const [sendGlLoading, setSendGlLoading] = useState(false);

  const [dedGoalId,  setDedGoalId]  = useState<number | null>(null);
  const [dedAmount,  setDedAmount]  = useState("");
  const [dedAsset,   setDedAsset]   = useState("");
  const [dedLoading, setDedLoading] = useState(false);

  const [addOpen,    setAddOpen]    = useState(false);
  const [addAmt,     setAddAmt]     = useState("");
  const [addAsset,   setAddAsset]   = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const { data: me } = useGetMe();
  const inHousehold = !!(me as any)?.householdId;

  const total   = larder?.total ?? 0;
  const entries = larder?.entries ?? [];
  const totalGLSent = entries
    .filter(e => e.sourceType === "great_larder_transfer")
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  // Only show the delta since the user last dismissed (long-pressed) the badge.
  // New transfers after a dismiss reappear; already-acknowledged ones are hidden.
  const displayGLSent = Math.max(0, totalGLSent - glDismissedAmount);

  // me is available from here; compute the user-scoped storage key now.
  const meId = (me as any)?.id as number | undefined;
  const glDismissedKey = `larder_gl_badge_dismissed_${meId ?? "x"}`;

  // Load user-scoped dismiss baseline once userId is known.
  useEffect(() => {
    if (!meId) return;
    try {
      const stored = parseFloat(localStorage.getItem(`larder_gl_badge_dismissed_${meId}`) ?? "0") || 0;
      setGlDismissedAmount(stored);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // Rebase: if totalGLSent drops below the dismissed baseline (e.g. after history clear),
  // reset so future new sends are visible immediately without exceeding the stale baseline.
  // Guard on `larder != null` — while the query is still loading, entries=[]/totalGLSent=0
  // which would incorrectly wipe a legitimate persisted baseline loaded from localStorage.
  useEffect(() => {
    if (!meId || !larder || totalGLSent >= glDismissedAmount) return;
    setGlDismissedAmount(totalGLSent);
    try { localStorage.setItem(`larder_gl_badge_dismissed_${meId}`, String(totalGLSent)); } catch { /* ignore */ }
  }, [totalGLSent, glDismissedAmount, meId, larder]);

  const assetOpts = assetOptions(larder?.currencyBreakdown ?? []);
  // Add form shows all supported currencies regardless of current larder balance
  const addCurrencyOrder = prefs.language === "pl"
    ? ["PLN", "EUR", "USD", "GBP"]
    : ["EUR", "USD", "GBP", "PLN"];
  const addAssetOpts: CurrencySubtotal[] = addCurrencyOrder.map(currency => {
    const existing = (larder?.currencyBreakdown ?? []).find(b => b.currency === currency);
    return { currency, rawTotal: existing?.rawTotal ?? 0 };
  });
  const spendAssetBalance = assetOpts.find(a => a.currency === spendAsset)?.rawTotal ?? total;
  const sendGlAssetBalance = assetOpts.find(a => a.currency === sendGlAsset)?.rawTotal ?? total;
  const dedAssetBalance = assetOpts.find(a => a.currency === dedAsset)?.rawTotal ?? total;

  useEffect(() => {
    if (spendOpen && assetOpts.length > 0 && !assetOpts.some(a => a.currency === spendAsset)) {
      setSpendAsset(assetOpts[0].currency);
    }
  }, [spendOpen, assetOpts]);
  useEffect(() => {
    if (sendGlOpen && assetOpts.length > 0 && !assetOpts.some(a => a.currency === sendGlAsset)) {
      setSendGlAsset(assetOpts[0].currency);
    }
  }, [sendGlOpen, assetOpts]);
  useEffect(() => {
    if (dedicateOpen && assetOpts.length > 0 && !assetOpts.some(a => a.currency === dedAsset)) {
      setDedAsset(assetOpts[0].currency);
    }
  }, [dedicateOpen, assetOpts]);
  useEffect(() => {
    if (addOpen && !addAssetOpts.some(a => a.currency === addAsset)) {
      setAddAsset(addAssetOpts[0].currency);
    }
  }, [addOpen, addAssetOpts]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["larder"] });
    // Also invalidate the generated hook's cache key used by the Goals page for diamond display
    queryClient.invalidateQueries({ queryKey: getGetLarderQueryKey() });
  }

  async function handleClearHistory(includeTransfers: boolean) {
    try {
      const url = `${import.meta.env.BASE_URL}api/larder/history${includeTransfers ? "?includeTransfers=true" : ""}`;
      const r = await apiFetch(url, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
      invalidate();
      setHistoryOpen(false);
      setShowClearConfirm(false);
      setClearIncludeTransfers(false);
      toast({ title: t("larder.history_cleared") });
    } catch {
      toast({ title: t("larder.clear_failed") });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(addAmt.replace(",", "."));
    if (isNaN(amount) || amount === 0) return;
    if (!isOnline) {
      void enqueue({
        endpoint: `${import.meta.env.BASE_URL}api/larder/add`,
        method: "POST",
        payload: { amount, currency: addAsset || prefs.currency },
      }).then(() => requestBackgroundSync()).catch(console.error);
      setAddOpen(false); setAddAmt("");
      toast({ title: "Saved offline — will sync when back online" });
      return;
    }
    setAddLoading(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/larder/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: addAsset || prefs.currency }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setAddOpen(false);
      setAddAmt("");
      toast({ title: t("larder.add_success") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed" });
    } finally { setAddLoading(false); }
  }

  async function handleSpend(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(spendAmt.replace(",", "."));
    if (isNaN(amount) || amount <= 0) return;
    if (amount > spendAssetBalance + 0.005) return;
    if (!isOnline) {
      void enqueue({
        endpoint: `${import.meta.env.BASE_URL}api/larder/spend`,
        method: "POST",
        payload: { description: spendDesc.trim(), amount, assetCurrency: spendAsset || undefined },
      }).then(() => requestBackgroundSync()).catch(console.error);
      setSpendOpen(false); setSpendDesc(""); setSpendAmt("");
      toast({ title: "Saved offline — will sync when back online" });
      return;
    }
    setSpendLoading(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/larder/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: spendDesc.trim(), amount, assetCurrency: spendAsset || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setSpendOpen(false);
      setSpendDesc(""); setSpendAmt("");
      toast({ title: t("larder.tx_created") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed" });
    } finally { setSpendLoading(false); }
  }

  async function handleSendToGL(e: React.FormEvent) {
    e.preventDefault();
    setSendGlLoading(true);
    try {
      let amount: number;
      if (sendGlMode === "percent") {
        const pct = parseFloat(sendGlPct.replace(",", "."));
        if (isNaN(pct) || pct < 1 || pct > 99) throw new Error("Enter a percentage between 1 and 99");
        amount = (pct / 100) * sendGlAssetBalance;
        if (amount <= 0) throw new Error("Niewystarczające saldo Spiżarni");
      } else {
        amount = parseFloat(sendGlAmt.replace(",", "."));
      }
      if (amount > sendGlAssetBalance + 0.005) { setSendGlLoading(false); return; }
      if (!isOnline) {
        void enqueue({
          endpoint: `${import.meta.env.BASE_URL}api/great-larder/send`,
          method: "POST",
          payload: { amount, assetCurrency: sendGlAsset || undefined },
        }).then(() => requestBackgroundSync()).catch(console.error);
        toast({ title: "Saved offline — will sync when back online" });
        setSendGlOpen(false); setSendGlAmt(""); setSendGlPct("");
        setSendGlLoading(false);
        return;
      }
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/great-larder/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, assetCurrency: sendGlAsset || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      toast({ title: t("larder.sent_to_gl_toast") });
      invalidate();
      setSendGlOpen(false);
      setSendGlAmt(""); setSendGlPct("");
    } catch (err: any) {
      toast({ title: err.message ?? "Failed" });
    } finally { setSendGlLoading(false); }
  }

  async function handleDedicate(e: React.FormEvent) {
    e.preventDefault();
    if (!dedGoalId) return;
    const amt = parseFloat(dedAmount.replace(",", "."));
    if (isNaN(amt) || amt <= 0) return;
    if (amt > dedAssetBalance + 0.005) return;
    if (!isOnline) {
      void enqueue({
        endpoint: `${import.meta.env.BASE_URL}api/larder/dedicate-to-goal`,
        method: "POST",
        payload: { goalId: dedGoalId, amount: amt, assetCurrency: dedAsset || undefined },
      }).then(() => requestBackgroundSync()).catch(console.error);
      toast({ title: "Saved offline — will sync when back online" });
      setDedicateOpen(false); setDedGoalId(null); setDedAmount("");
      return;
    }
    setDedLoading(true);
    try {
      const r = await apiFetch(`${import.meta.env.BASE_URL}api/larder/dedicate-to-goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: dedGoalId, amount: amt, assetCurrency: dedAsset || undefined }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      const data = await r.json().catch(() => ({}));
      invalidate();
      queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
      setDedicateOpen(false);
      setDedGoalId(null); setDedAmount("");
      toast({ title: data.goalCompleted ? t("larder.goal_completed_toast") : t("larder.dedicate_success") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed" });
    } finally { setDedLoading(false); }
  }

  const positiveEntries = entries.filter(e => e.amount >= 0);
  const negativeEntries = entries.filter(e => e.amount < 0);

  return (
    <>
      <style>{`
        @keyframes gemFlash { 0%{opacity:0;transform:scale(0.15) rotate(0deg)} 25%{opacity:1;transform:scale(1) rotate(0deg)} 55%{opacity:0.45;transform:scale(0.8) rotate(45deg)} 75%{opacity:0.9;transform:scale(1) rotate(0deg)} 100%{opacity:0;transform:scale(0.15) rotate(0deg)} }
        @keyframes glGemFlash { 0%{opacity:0;transform:scale(0.2) rotate(0deg)} 10%{opacity:1;transform:scale(1) rotate(0deg)} 20%{opacity:0.7;transform:scale(0.9) rotate(45deg)} 28%{opacity:0;transform:scale(0.2) rotate(0deg)} 100%{opacity:0;transform:scale(0.2) rotate(0deg)} }
        @keyframes larderEdge1 { 0%{transform:translateX(-110px);opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{transform:translateX(100vw);opacity:0} }
        @keyframes larderEdge2 { 0%{transform:translateX(100vw);opacity:0} 15%{opacity:0.85} 85%{opacity:0.85} 100%{transform:translateX(-80px);opacity:0} }
        @keyframes larderEdge3 { 0%{transform:translateX(10%);opacity:0.45} 40%{opacity:0.95;transform:translateX(60%)} 100%{transform:translateX(10%);opacity:0.45} }
      `}</style>
      <div
        ref={ref}
        className="relative overflow-hidden rounded-3xl touch-pan-y"
        style={{
          background: "linear-gradient(145deg, #030305 0%, #0c0b12 18%, #050408 35%, #0f0d18 52%, #040305 68%, #0a0910 82%, #030305 100%)",
          border: revealed ? "1px solid rgba(255,255,255,0.48)" : "1px solid rgba(255,255,255,0.12)",
          boxShadow: revealed
            ? "0 0 55px 16px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.28)"
            : "0 0 60px 8px rgba(255,255,255,0.03), 0 0 120px 20px rgba(255,255,255,0.015), inset 0 1px 0 rgba(255,255,255,0.09)",
          transition: "border-color 0.8s ease, box-shadow 0.8s ease",
        }}
      >
        {/* Border edge wave glow — hidden when animations disabled */}
        {!noAnim && (
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none"
          style={{ zIndex:12, opacity: revealed ? 1 : 0.72, transition: "opacity 0.9s ease" }}
        >
          <div style={{ position:"absolute", top:0, left:0, height:"2px", width:"140px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.90), transparent)", animation:"larderEdge1 6s ease-in-out 0s infinite" }} />
          <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"95px",  background:"linear-gradient(to right, transparent, rgba(255,255,255,0.65), transparent)", animation:"larderEdge2 8.5s ease-in-out 1.5s infinite" }} />
          <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"80px",  background:"linear-gradient(to right, transparent, rgba(255,255,255,0.72), transparent)", animation:"larderEdge3 5s ease-in-out 3s infinite" }} />
          {revealed && <>
            <div style={{ position:"absolute", top:0, left:0, height:"2px", width:"150px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.95), transparent)", animation:"larderEdge1 3.8s ease-in-out 0.4s infinite" }} />
            <div style={{ position:"absolute", top:0, left:0, height:"1px", width:"105px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.80), transparent)", animation:"larderEdge2 5.5s ease-in-out 0s infinite" }} />
            <div style={{ position:"absolute", bottom:0, left:0, height:"1px", width:"115px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.65), transparent)", animation:"larderEdge3 6.5s ease-in-out 2s infinite" }} />
            <div style={{ position:"absolute", top:0, left:0, width:"1px", height:"100%", background:"linear-gradient(to bottom, rgba(255,255,255,0.60) 0%, transparent 60%)", animation:"larderEdge2 7s ease-in-out 1s infinite" }} />
          </>}
        </div>
        )}
        {/* Gem sparkles — appear when revealed, hidden when animations disabled */}
        {revealed && !noAnim && (
          <>
            <div style={{ position:"absolute", top:8, left:"15%", width:18, height:18, pointerEvents:"none", zIndex:20, animation:"gemFlash 2.8s ease-in-out 0s infinite" }}>
              <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.95), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.95), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:3, height:3, borderRadius:"50%", background:"white", boxShadow:"0 0 5px 2px rgba(255,255,255,0.9)" }} />
            </div>
            <div style={{ position:"absolute", top:5, right:"19%", width:13, height:13, pointerEvents:"none", zIndex:20, animation:"gemFlash 3.4s ease-in-out 0.9s infinite" }}>
              <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.85), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.85), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 2px rgba(255,255,255,0.8)" }} />
            </div>
            <div style={{ position:"absolute", bottom:9, left:"32%", width:15, height:15, pointerEvents:"none", zIndex:20, animation:"gemFlash 3.1s ease-in-out 1.6s infinite" }}>
              <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.80), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.80), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 1px rgba(255,255,255,0.7)" }} />
            </div>
            <div style={{ position:"absolute", top:"40%", right:7, width:11, height:11, pointerEvents:"none", zIndex:20, animation:"gemFlash 2.5s ease-in-out 2.2s infinite" }}>
              <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.75), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.75), transparent)" }} />
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 3px 1px rgba(255,255,255,0.6)" }} />
            </div>
          </>
        )}
        <div className="relative z-10 px-5 pt-5 pb-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Warehouse className="w-4.5 h-4.5 text-white/50" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-white/35">
                {t("larder.tab")}
              </p>
              <p className="text-[11px] text-white/25 -mt-0.5">{t("larder.subtitle")}</p>
            </div>
          </div>

          {/* Balance */}
          <div className="text-center py-1">
            <p
              className="text-5xl font-bold tracking-tight text-white tabular-nums"
              style={{ textShadow: "0 0 32px rgba(255,255,255,0.20), 0 0 64px rgba(255,255,255,0.08)" }}
            >
              <AmtHero amount={total} currency={prefs.currency} />
            </p>
            {/* Currency breakdown — shown when savings span multiple currencies,
                or a subtle label when all contributions share one currency */}
            {(() => {
              const breakdown = larder?.currencyBreakdown ?? [];
              const ordered = orderedBreakdown(breakdown, prefs.currency, prefs.language);
              if (ordered.length === 0) return null;
              if (ordered.length === 1) {
                // Single currency — show a muted "all in X" label instead of a lone sub-sum
                return (
                  <p className="mt-2 text-[11px] text-white/25 tabular-nums">
                    {t("larder.all_in_currency", { code: ordered[0].currency })}
                  </p>
                );
              }
              // Multiple currencies — show each raw sub-total
              return (
                <div className="mt-2.5 flex flex-col items-center gap-0.5">
                  {ordered.map(item => (
                    <p key={item.currency} className="text-[11px] text-white/30 tabular-nums">
                      {fmtAmt(item.rawTotal, item.currency)}
                    </p>
                  ))}
                </div>
              );
            })()}
            {displayGLSent > 0 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => { if (!glWasLongPress.current) setGlBadgeCollapsed(c => !c); glWasLongPress.current = false; }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    glWasLongPress.current = false;
                    if (glLongPressTimer.current) clearTimeout(glLongPressTimer.current);
                    glLongPressTimer.current = setTimeout(() => {
                      glLongPressTimer.current = null;
                      glWasLongPress.current = true;
                      // Dismiss: record current total; badge only reappears when new sends happen
                      const dismissed = totalGLSent;
                      setGlDismissedAmount(dismissed);
                      try { localStorage.setItem(glDismissedKey, String(dismissed)); } catch { /* ignore */ }
                    }, 600);
                  }}
                  onPointerUp={() => { if (glLongPressTimer.current) { clearTimeout(glLongPressTimer.current); glLongPressTimer.current = null; } }}
                  onPointerLeave={() => { if (glLongPressTimer.current) { clearTimeout(glLongPressTimer.current); glLongPressTimer.current = null; } }}
                  onPointerCancel={() => { if (glLongPressTimer.current) { clearTimeout(glLongPressTimer.current); glLongPressTimer.current = null; } }}
                  className={`relative inline-flex flex-col items-center justify-center px-2.5 py-1 border border-white/50 bg-black text-[10px] font-semibold text-white/80 active:scale-95 select-none touch-manipulation transition-all duration-300 ease-in-out ${hintVisible ? "rounded-2xl" : "rounded-full"}`}
                  style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.18)" }}
                  title={glBadgeCollapsed ? t("larder.source_transfer") : undefined}
                >
                  {/* main row: icon + label */}
                  <div className="flex items-center gap-1.5">
                    <ArrowRightCircle className="w-2.5 h-2.5 text-white/60 flex-shrink-0" />
                    <span
                      className="flex items-center gap-1.5 overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxWidth: glBadgeCollapsed ? "0px" : "280px",
                        opacity: glBadgeCollapsed ? 0 : 1,
                      }}
                    >
                      <span className="tabular-nums whitespace-nowrap">{fmtAmt(displayGLSent, prefs.currency)}</span>
                      <span className="text-white/50 whitespace-nowrap">{t("larder.source_transfer")}</span>
                    </span>
                  </div>
                  {/* hint row — slides in downward, then back up */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{
                      maxHeight: hintVisible ? "18px" : "0px",
                      opacity: hintVisible ? 1 : 0,
                      marginTop: hintVisible ? "3px" : "0px",
                    }}
                  >
                    <p className="text-[8px] text-white/50 whitespace-nowrap">{t("larder.hint_reset")}</p>
                  </div>
                  {!noAnim && <>
                    {/* top-left */}
                    <div style={{ position:"absolute", top:-7, left:-6, width:11, height:11, pointerEvents:"none", animation:"glGemFlash 6s ease-in-out 0s infinite" }}>
                      <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.9), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.9), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 1px rgba(255,255,255,0.8)" }} />
                    </div>
                    {/* top-right */}
                    <div style={{ position:"absolute", top:-7, right:-6, width:10, height:10, pointerEvents:"none", animation:"glGemFlash 6s ease-in-out 1.5s infinite" }}>
                      <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.85), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.85), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 3px 1px rgba(255,255,255,0.75)" }} />
                    </div>
                    {/* bottom-right */}
                    <div style={{ position:"absolute", bottom:-7, right:-6, width:10, height:10, pointerEvents:"none", animation:"glGemFlash 6s ease-in-out 3s infinite" }}>
                      <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.82), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.82), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 3px 1px rgba(255,255,255,0.7)" }} />
                    </div>
                    {/* bottom-left */}
                    <div style={{ position:"absolute", bottom:-7, left:-6, width:11, height:11, pointerEvents:"none", animation:"glGemFlash 6s ease-in-out 4.5s infinite" }}>
                      <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"100%", background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.88), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:0, transform:"translateY(-50%)", width:"100%", height:"1px", background:"linear-gradient(to right, transparent, rgba(255,255,255,0.88), transparent)" }} />
                      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:2, height:2, borderRadius:"50%", background:"white", boxShadow:"0 0 4px 1px rgba(255,255,255,0.78)" }} />
                    </div>
                  </>}
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className={`grid gap-2.5 ${inHousehold ? "grid-cols-4" : "grid-cols-3"}`}>
            <button
              onClick={() => setAddOpen(true)}
              disabled={!isOnline}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">{t("larder.add_entry")}</span>
            </button>
            <button
              onClick={() => setSpendOpen(true)}
              disabled={!isOnline || total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <PiggyBank className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">{t("larder.fund")}</span>
            </button>
            <button
              onClick={() => setDedicateOpen(true)}
              disabled={!isOnline || total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <Target className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">{t("larder.support_btn")}</span>
            </button>
            {inHousehold && (
              <button
                onClick={() => setSendGlOpen(true)}
                disabled={!isOnline || total <= 0}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
              >
                <Users className="w-4 h-4 flex-shrink-0" />
                <span className="text-[11px] leading-tight text-center">{t("larder.send_gl_btn")}</span>
              </button>
            )}
          </div>

          {/* Recent entries — collapsible */}
          {entries.length > 0 && (
            <div className="border-t border-white/6 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setHistoryOpen(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-white/35 font-semibold uppercase tracking-widest"
                >
                  <span>{t("larder.history", { n: entries.length })}</span>
                  {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setClearIncludeTransfers(false); setShowClearConfirm(true); }}
                  disabled={!isOnline}
                  className="flex items-center gap-1 text-[10px] text-white/25 active:text-red-400/70 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                  {t("larder.clear")}
                </button>
              </div>
              {historyOpen && (
                <div className="space-y-1 pt-1">
                  {entries.slice(0, 20).map(e => {
                    const positive = e.amount >= 0;
                    const d = new Date(e.createdAt);
                    const dateStr = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
                    return (
                      <div key={e.id} className="flex items-center gap-2.5 py-1.5">
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                          <EntryIcon sourceType={e.sourceType} positive={positive} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/70 truncate">{e.sourceType === "great_larder_transfer" ? sourceLabel(e.sourceType) : (e.note || sourceLabel(e.sourceType))}</p>
                          <p className="text-[10px] text-white/25">{dateStr}</p>
                        </div>
                        <p className={`text-xs font-semibold tabular-nums flex-shrink-0 ${positive ? "text-emerald-400" : "text-red-400"}`}>
                          {positive ? "+" : "−"}{fmtAmt(Math.abs(e.amount), prefs.currency)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Fund (spend from Larder into a transaction) sheet ── */}
      <Sheet title={t("larder.spend_sheet_title")} open={spendOpen} onClose={() => setSpendOpen(false)}>
        <form onSubmit={handleSpend} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.description")}</label>
            <input type="text" required value={spendDesc} onChange={e => setSpendDesc(e.target.value)}
              placeholder={t("larder.description")} className={inputCls} />
          </div>
          <AssetSelect options={assetOpts} value={spendAsset} onChange={setSpendAsset} />
          <div className="space-y-1.5">
            <label className={labelCls}>
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(spendAssetBalance, spendAsset || prefs.currency)}
            </label>
            <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" required value={spendAmt}
              onChange={e => setSpendAmt(e.target.value)} placeholder="0.00" className={inputCls} />
            <ConversionPreview amount={parseFloat(spendAmt.replace(",", "."))} from={spendAsset || prefs.currency} to={prefs.currency} rates={rates} />
            <p className="text-xs text-white/25 leading-relaxed">
              {t("larder.from_larder_desc")}
            </p>
          </div>
          {(() => {
            const amt = parseFloat(spendAmt.replace(",", "."));
            if (!isNaN(amt) && amt > 0 && amt > spendAssetBalance + 0.005) {
              return (
                <div className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
                  <p className="text-xs text-amber-300">{t("larder.insufficient_asset", { code: spendAsset || prefs.currency })}</p>
                </div>
              );
            }
            return null;
          })()}
          <button type="submit"
            disabled={spendLoading || total <= 0 || (() => { const a = parseFloat(spendAmt.replace(",", ".")); return !isNaN(a) && a > 0 && a > spendAssetBalance + 0.005; })()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {spendLoading ? "…" : t("larder.fund")}
          </button>
        </form>
      </Sheet>

      {/* ── Send to Great Larder sheet ── */}
      {inHousehold && (
        <Sheet title={t("larder.send_gl_sheet_title")} open={sendGlOpen} onClose={() => setSendGlOpen(false)}>
          <form onSubmit={handleSendToGL} className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setSendGlMode("amount")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  sendGlMode === "amount" ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/3 text-white/50"
                }`}>
                {t("larder.amount_label")}
              </button>
              <button type="button" onClick={() => setSendGlMode("percent")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  sendGlMode === "percent" ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/3 text-white/50"
                }`}>
                {t("larder.percent_label")}
              </button>
            </div>
            <AssetSelect options={assetOpts} value={sendGlAsset} onChange={setSendGlAsset} />
            {sendGlMode === "amount" ? (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(sendGlAssetBalance, sendGlAsset || prefs.currency)}
                </label>
                <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" required value={sendGlAmt}
                  onChange={e => setSendGlAmt(e.target.value)} placeholder="0.00" className={inputCls} />
                <ConversionPreview amount={parseFloat(sendGlAmt.replace(",", "."))} from={sendGlAsset || prefs.currency} to={prefs.currency} rates={rates} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  {t("larder.percent_label")}{sendGlPct ? ` · ${fmtAmt((sendGlAssetBalance * (parseFloat(sendGlPct) || 0)) / 100, sendGlAsset || prefs.currency)} ${t("larder.will_be_sent")}` : ""}
                </label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" required value={sendGlPct}
                  onChange={e => setSendGlPct(e.target.value)} placeholder="np. 25" className={inputCls} />
                <ConversionPreview
                  amount={(sendGlAssetBalance * (parseFloat(sendGlPct) || 0)) / 100}
                  from={sendGlAsset || prefs.currency} to={prefs.currency} rates={rates}
                />
                <p className="text-xs text-white/30 leading-relaxed">
                  {t("larder.calc_sent_gl")}
                </p>
              </div>
            )}
            {(() => {
              const amt = sendGlMode === "amount"
                ? parseFloat(sendGlAmt.replace(",", "."))
                : (sendGlAssetBalance * (parseFloat(sendGlPct) || 0)) / 100;
              if (!isNaN(amt) && amt > 0 && amt > sendGlAssetBalance + 0.005) {
                return (
                  <div className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
                    <p className="text-xs text-amber-300">{t("larder.insufficient_asset", { code: sendGlAsset || prefs.currency })}</p>
                  </div>
                );
              }
              return null;
            })()}
            <button type="submit"
              disabled={sendGlLoading || total <= 0 || (() => { const a = sendGlMode === "amount" ? parseFloat(sendGlAmt.replace(",", ".")) : (sendGlAssetBalance * (parseFloat(sendGlPct) || 0)) / 100; return !isNaN(a) && a > 0 && a > sendGlAssetBalance + 0.005; })()}
              className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
              {sendGlLoading ? "…" : t("larder.send")}
            </button>
          </form>
        </Sheet>
      )}

      {/* ── Add to Larder sheet ── */}
      <Sheet title={t("larder.add_sheet_title")} open={addOpen} onClose={() => { setAddOpen(false); setAddAmt(""); }}>
        <form onSubmit={handleAdd} className="space-y-4">
          <AssetSelect options={addAssetOpts} value={addAsset} onChange={setAddAsset} />
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.amount_label")}</label>
            <input
              type="text"
              inputMode="decimal"
              value={addAmt}
              onChange={e => setAddAmt(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              autoFocus
            />
            <ConversionPreview
              amount={Math.abs(parseFloat(addAmt.replace(",", ".")))}
              from={addAsset || prefs.currency}
              to={prefs.currency}
              rates={rates}
            />
          </div>
          <button
            type="submit"
            disabled={addLoading || (() => { const a = parseFloat(addAmt.replace(",", ".")); return isNaN(a) || a === 0; })()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50"
          >
            {addLoading ? "…" : t("larder.add_entry")}
          </button>
        </form>
      </Sheet>

      {/* ── Dedicate to goal sheet ── */}
      <Sheet title={t("larder.dedicate_sheet_title")} open={dedicateOpen} onClose={() => setDedicateOpen(false)}>
        <form onSubmit={handleDedicate} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.select_goal")}</label>
            {(goals ?? []).length === 0 ? (
              <p className="text-sm text-white/40">{t("larder.no_goals")}</p>
            ) : (
              <div className="space-y-2">
                {(goals ?? []).map((g: any) => (
                  <button key={g.id} type="button" onClick={() => setDedGoalId(g.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
                      dedGoalId === g.id
                        ? "border-white/40 bg-white/10"
                        : "border-white/10 bg-white/3"
                    }`}>
                    <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color ?? "#818cf8" }} />
                    <p className="text-sm font-medium truncate text-left text-white/80">{g.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <AssetSelect options={assetOpts} value={dedAsset} onChange={setDedAsset} />
          <div className="space-y-1.5">
            <label className={labelCls}>
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(dedAssetBalance, dedAsset || prefs.currency)}
            </label>
            <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" required
              value={dedAmount} onChange={e => setDedAmount(e.target.value)}
              placeholder="0.00" className={inputCls} />
            <ConversionPreview amount={parseFloat(dedAmount.replace(",", "."))} from={dedAsset || prefs.currency} to={prefs.currency} rates={rates} />
            {dedGoalId && (() => {
              const summary = (goalSummaries ?? []).find((s: any) => s.goalId === dedGoalId);
              if (!summary) return null;
              const remaining = summary.budget - summary.contributed;
              const goalObj = (goals ?? []).find((g: any) => g.id === dedGoalId);
              const currency = (goalObj as any)?.currency ?? prefs.currency;
              if (remaining <= 0) return (
                <p className="text-xs text-emerald-400/80">{t("home.goal_completed")}</p>
              );
              const enteredAmt = parseFloat(dedAmount.replace(",", "."));
              const wouldComplete = !isNaN(enteredAmt) && enteredAmt > 0 && enteredAmt >= remaining - 0.005;
              return (
                <>
                  <p className="text-xs text-white/45">{t("home.goal_remaining", { amt: fmtAmt(remaining, currency) })}</p>
                  {wouldComplete && (
                    <p className="text-xs text-amber-300/80 mt-0.5">{t("larder.goal_completes_24h")}</p>
                  )}
                </>
              );
            })()}
          </div>
          {(() => {
            const amt = parseFloat(dedAmount.replace(",", "."));
            if (!isNaN(amt) && amt > 0 && amt > dedAssetBalance + 0.005) {
              return (
                <div className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10">
                  <p className="text-xs text-amber-300">{t("larder.insufficient_asset", { code: dedAsset || prefs.currency })}</p>
                </div>
              );
            }
            return null;
          })()}
          <button type="submit"
            disabled={dedLoading || !dedGoalId || (goals ?? []).length === 0 || (() => { const a = parseFloat(dedAmount.replace(",", ".")); return !isNaN(a) && a > 0 && a > dedAssetBalance + 0.005; })()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {dedLoading ? "…" : t("larder.dedicate")}
          </button>
        </form>
      </Sheet>
      {/* Clear history confirmation dialog */}
      <Dialog open={showClearConfirm} onOpenChange={open => { setShowClearConfirm(open); if (!open) setClearIncludeTransfers(false); }}>
        <DialogContent className="bg-zinc-900 border-white/10 rounded-2xl max-w-xs mx-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-base">{t("larder.history_clear_confirm_title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">{t("larder.history_clear_confirm_desc")}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <Checkbox
              checked={clearIncludeTransfers}
              onCheckedChange={v => setClearIncludeTransfers(Boolean(v))}
              className="border-white/20 data-[state=checked]:bg-white data-[state=checked]:border-white"
            />
            <span className="text-sm text-white/70">{t("larder.history_clear_also_transfers")}</span>
          </label>
          <DialogFooter className="flex-row gap-2 pt-1">
            <button
              onClick={() => { setShowClearConfirm(false); setClearIncludeTransfers(false); }}
              className="flex-1 py-3 rounded-2xl border border-white/10 text-white/60 text-sm font-medium active:opacity-70 transition"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => handleClearHistory(clearIncludeTransfers)}
              className="flex-1 py-3 rounded-2xl bg-destructive/10 text-destructive text-sm font-semibold active:opacity-70 transition"
            >
              {t("larder.history_clear_confirm_action")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

LarderCard.displayName = "LarderCard";
export default LarderCard;
