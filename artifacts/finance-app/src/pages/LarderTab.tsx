import { forwardRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListGoals } from "@workspace/api-client-react";
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
  if (sourceType === "goal_dedication")   return t("larder.source_dedication");
  if (sourceType === "great_larder_transfer") return t("larder.source_transfer");
  return t("larder.source_manual");
}

function EntryIcon({ sourceType, positive }: { sourceType: string; positive: boolean }) {
  if (sourceType === "recurring_payment") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (sourceType === "larder_fund")       return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
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

const LarderCard = forwardRef<HTMLDivElement>((_, ref) => {
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

  const [fundOpen,     setFundOpen]     = useState(false);
  const [dedicateOpen, setDedicateOpen] = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  const [fundDesc,    setFundDesc]    = useState("");
  const [fundTotal,   setFundTotal]   = useState("");
  const [fundPortion, setFundPortion] = useState("");
  const [fundLoading, setFundLoading] = useState(false);

  const [dedGoalId,  setDedGoalId]  = useState<number | null>(null);
  const [dedAmount,  setDedAmount]  = useState("");
  const [dedLoading, setDedLoading] = useState(false);

  const total   = larder?.total ?? 0;
  const entries = larder?.entries ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["larder"] });
  }

  async function handleFund(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(fundTotal);
    const larderAmount = parseFloat(fundPortion);
    if (isNaN(amount) || amount <= 0 || isNaN(larderAmount) || larderAmount <= 0) return;
    setFundLoading(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: fundDesc.trim(), amount, larderAmount }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      invalidate();
      setFundOpen(false);
      setFundDesc(""); setFundTotal(""); setFundPortion("");
      toast({ title: t("larder.fund_success") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to fund Larder", variant: "destructive" });
    } finally { setFundLoading(false); }
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
        {/* Shine sweep */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div
            className="absolute -inset-full"
            style={{
              background: "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.06) 50%, transparent 75%)",
              animation: "larderShine 5s ease-in-out infinite",
            }}
          />
        </div>

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
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setDedicateOpen(true)}
              disabled={total <= 0}
              className="flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <Target className="w-4 h-4 flex-shrink-0" />
              <span>Dedicate to goal</span>
            </button>
            <button
              onClick={() => setFundOpen(true)}
              className="flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors"
            >
              <PiggyBank className="w-4 h-4 flex-shrink-0" />
              <span>Fund</span>
            </button>
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

      {/* ── Fund Larder sheet ── */}
      <Sheet title={t("larder.fund_sheet_title")} open={fundOpen} onClose={() => setFundOpen(false)}>
        <form onSubmit={handleFund} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.description")}</label>
            <input type="text" required value={fundDesc} onChange={e => setFundDesc(e.target.value)}
              placeholder={t("larder.description")} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.amount_label")} ({prefs.currency})</label>
            <input type="number" step="0.01" min="0.01" required value={fundTotal}
              onChange={e => setFundTotal(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>{t("larder.larder_portion")} ({prefs.currency})</label>
            <input type="number" step="0.01" min="0.01" required value={fundPortion}
              onChange={e => setFundPortion(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
            <p className="text-xs text-white/25 leading-relaxed">
              Full amount appears in your transactions; only this portion is saved to the Larder.
            </p>
          </div>
          <button type="submit" disabled={fundLoading}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {fundLoading ? "…" : t("larder.fund")}
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
