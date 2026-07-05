import { forwardRef, useState, useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListGoals, useGetMe } from "@workspace/api-client-react";
import { loadPrefs, currencySymbol, fmtAmt } from "@/lib/prefs";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, PiggyBank, Target, TrendingUp, TrendingDown,
  ArrowRightCircle, X, ChevronDown, ChevronUp,
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

type LarderSummary = {
  total: number;
  currency: string;
  entries: LarderEntry[];
};

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

const LarderCard = forwardRef<HTMLDivElement, {}>((_props, ref) => {
  const prefs = loadPrefs();
  const sym = currencySymbol(prefs.currency);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const [dedicateOpen, setDedicateOpen] = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  const [spendOpen,    setSpendOpen]    = useState(false);
  const [spendDesc,    setSpendDesc]    = useState("");
  const [spendAmt,     setSpendAmt]     = useState("");
  const [spendLoading, setSpendLoading] = useState(false);

  const [sendGlOpen,    setSendGlOpen]    = useState(false);
  const [sendGlMode,    setSendGlMode]    = useState<"amount" | "percent">("amount");
  const [sendGlAmt,     setSendGlAmt]     = useState("");
  const [sendGlPct,     setSendGlPct]     = useState("");
  const [sendGlLoading, setSendGlLoading] = useState(false);

  const [dedGoalId,  setDedGoalId]  = useState<number | null>(null);
  const [dedAmount,  setDedAmount]  = useState("");
  const [dedLoading, setDedLoading] = useState(false);

  const { data: me } = useGetMe();
  const inHousehold = !!(me as any)?.householdId;

  const total   = larder?.total ?? 0;
  const entries = larder?.entries ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["larder"] });
  }

  async function handleSpend(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(spendAmt);
    if (isNaN(amount) || amount <= 0) return;
    setSpendLoading(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: spendDesc.trim(), amount }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setSpendOpen(false);
      setSpendDesc(""); setSpendAmt("");
      toast({ title: "Transaction created from Larder" });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed", variant: "destructive" });
    } finally { setSpendLoading(false); }
  }

  async function handleSendToGL(e: React.FormEvent) {
    e.preventDefault();
    setSendGlLoading(true);
    try {
      const body = sendGlMode === "percent"
        ? { percent: parseFloat(sendGlPct) }
        : { amount: parseFloat(sendGlAmt) };
      const r = await fetch(`${import.meta.env.BASE_URL}api/great-larder/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setSendGlOpen(false);
      setSendGlAmt(""); setSendGlPct("");
      toast({ title: "Sent to Great Larder" });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed", variant: "destructive" });
    } finally { setSendGlLoading(false); }
  }

  async function handleDedicate(e: React.FormEvent) {
    e.preventDefault();
    if (!dedGoalId) return;
    const amt = parseFloat(dedAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (amt > total + 0.001) {
      toast({ title: t("larder.insufficient"), variant: "destructive" }); return;
    }
    setDedLoading(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder/dedicate-to-goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ goalId: dedGoalId, amount: amt }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setDedicateOpen(false);
      setDedGoalId(null); setDedAmount("");
      toast({ title: t("larder.dedicate_success") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed", variant: "destructive" });
    } finally { setDedLoading(false); }
  }

  const positiveEntries = entries.filter(e => e.amount >= 0);
  const negativeEntries = entries.filter(e => e.amount < 0);

  return (
    <>
      <div
        ref={ref}
        className="relative overflow-hidden rounded-3xl border border-white/10"
        style={{
          background: "linear-gradient(135deg, #080808 0%, #161616 35%, #0e0e0e 60%, #0a0a0a 100%)",
          boxShadow: "0 0 60px 8px rgba(255,255,255,0.03), 0 0 120px 20px rgba(255,255,255,0.015), inset 0 1px 0 rgba(255,255,255,0.09)",
        }}
      >
        <div className="relative z-10 px-5 pt-5 pb-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Warehouse className="w-4.5 h-4.5 text-white/50" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-white/35">
                Spiżarnia
              </p>
              <p className="text-[11px] text-white/20 -mt-0.5">Larder · personal savings</p>
            </div>
          </div>

          {/* Balance */}
          <div className="text-center py-1">
            <p
              className="text-5xl font-bold tracking-tight text-white tabular-nums"
              style={{ textShadow: "0 0 32px rgba(255,255,255,0.20), 0 0 64px rgba(255,255,255,0.08)" }}
            >
              {sym}{fmtAmt(total, prefs.currency).replace(/^[^0-9-]*/,"").replace(sym,"")}
            </p>
            <p className="text-xs text-white/25 mt-1.5 tracking-wide">{prefs.currency} · personal savings</p>
          </div>

          {/* Action buttons */}
          <div className={`grid gap-2.5 ${inHousehold ? "grid-cols-3" : "grid-cols-2"}`}>
            <button
              onClick={() => setDedicateOpen(true)}
              disabled={total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <Target className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">Dedicate to goal</span>
            </button>
            <button
              onClick={() => setSpendOpen(true)}
              disabled={total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <PiggyBank className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">Fund</span>
            </button>
            {inHousehold && (
              <button
                onClick={() => setSendGlOpen(true)}
                disabled={total <= 0}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
              >
                <ArrowRightCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-[11px] leading-tight text-center">Send to Great Larder</span>
              </button>
            )}
          </div>

          {/* Recent entries — collapsible */}
          {entries.length > 0 && (
            <div className="border-t border-white/6 pt-4 space-y-2">
              <button
                onClick={() => setHistoryOpen(v => !v)}
                className="w-full flex items-center justify-between text-xs text-white/35 font-semibold uppercase tracking-widest"
              >
                <span>History ({entries.length})</span>
                {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
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
                          <p className="text-xs font-medium text-white/70 truncate">{e.note || sourceLabel(e.sourceType)}</p>
                          <p className="text-[10px] text-white/25">{dateStr}</p>
                        </div>
                        <p className={`text-xs font-semibold tabular-nums flex-shrink-0 ${positive ? "text-emerald-400" : "text-red-400"}`}>
                          {positive ? "+" : "−"}{sym}{Math.abs(e.amount).toFixed(2)}
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
          <div className="space-y-1.5">
            <label className={labelCls}>
              {t("larder.amount_label")} ({prefs.currency}) · Balance: {sym}{total.toFixed(2)}
            </label>
            <input type="number" step="0.01" min="0.01" max={total} required value={spendAmt}
              onChange={e => setSpendAmt(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
            <p className="text-xs text-white/25 leading-relaxed">
              Creates a transaction from your Larder, marked with a "From Larder" badge.
            </p>
          </div>
          <button type="submit" disabled={spendLoading || total <= 0}
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
            {sendGlMode === "amount" ? (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  {t("larder.amount_label")} ({prefs.currency}) · Balance: {sym}{total.toFixed(2)}
                </label>
                <input type="number" step="0.01" min="0.01" max={total} required value={sendGlAmt}
                  onChange={e => setSendGlAmt(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  {t("larder.percent_label")} · {sym}{((total * (parseFloat(sendGlPct) || 0)) / 100).toFixed(2)}
                </label>
                <input type="number" step="1" min="1" max="100" required value={sendGlPct}
                  onChange={e => setSendGlPct(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
              </div>
            )}
            <button type="submit" disabled={sendGlLoading || total <= 0}
              className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
              {sendGlLoading ? "…" : t("larder.send")}
            </button>
          </form>
        </Sheet>
      )}

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
          <div className="space-y-1.5">
            <label className={labelCls}>
              {t("larder.amount_label")} ({prefs.currency}) · Balance: {sym}{total.toFixed(2)}
            </label>
            <input type="number" step="0.01" min="0.01" max={total} required
              value={dedAmount} onChange={e => setDedAmount(e.target.value)}
              inputMode="decimal" placeholder="0.00" className={inputCls} />
          </div>
          <button type="submit" disabled={dedLoading || !dedGoalId || (goals ?? []).length === 0}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {dedLoading ? "…" : t("larder.dedicate")}
          </button>
        </form>
      </Sheet>
    </>
  );
});

LarderCard.displayName = "LarderCard";
export default LarderCard;
