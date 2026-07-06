import { forwardRef, useState, useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListGoals, useGetMe, getListGoalsQueryKey, getGetGoalsSummaryQueryKey } from "@workspace/api-client-react";
import { loadPrefs, currencySymbol, fmtAmt } from "@/lib/prefs";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, PiggyBank, Target, TrendingUp, TrendingDown,
  ArrowRightCircle, X, ChevronDown, ChevronUp, Trash2, Users,
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
  glPercent: number | null;
  glRuleSynced: number;
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

const LarderCard = forwardRef<HTMLDivElement, { revealed?: boolean }>(({ revealed = false }, ref) => {
  const prefs = loadPrefs();
  const noAnim = prefs.disableAnimations;
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
  const totalGLSent = entries
    .filter(e => e.sourceType === "great_larder_transfer")
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["larder"] });
  }

  async function handleClearHistory() {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder/history`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      invalidate();
      setHistoryOpen(false);
      toast({ title: t("larder.history_cleared") });
    } catch {
      toast({ title: t("larder.clear_failed"), variant: "destructive" });
    }
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
      toast({ title: t("larder.tx_created") });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed", variant: "destructive" });
    } finally { setSpendLoading(false); }
  }

  async function handleSendToGL(e: React.FormEvent) {
    e.preventDefault();
    setSendGlLoading(true);
    try {
      let amount: number;
      if (sendGlMode === "percent") {
        const pct = parseFloat(sendGlPct);
        if (isNaN(pct) || pct < 1 || pct > 99) throw new Error("Enter a percentage between 1 and 99");
        amount = (pct / 100) * total;
        if (amount <= 0) throw new Error("Niewystarczające saldo Spiżarni");
      } else {
        amount = parseFloat(sendGlAmt);
      }
      const r = await fetch(`${import.meta.env.BASE_URL}api/great-larder/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error ?? "Failed"); }
      toast({ title: t("larder.sent_to_gl_toast") });
      invalidate();
      setSendGlOpen(false);
      setSendGlAmt(""); setSendGlPct("");
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
      queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetGoalsSummaryQueryKey() });
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
      <style>{`
        @keyframes gemFlash { 0%{opacity:0;transform:scale(0.15) rotate(0deg)} 25%{opacity:1;transform:scale(1) rotate(0deg)} 55%{opacity:0.45;transform:scale(0.8) rotate(45deg)} 75%{opacity:0.9;transform:scale(1) rotate(0deg)} 100%{opacity:0;transform:scale(0.15) rotate(0deg)} }
        @keyframes larderEdge1 { 0%{transform:translateX(-110px);opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{transform:translateX(100vw);opacity:0} }
        @keyframes larderEdge2 { 0%{transform:translateX(100vw);opacity:0} 15%{opacity:0.85} 85%{opacity:0.85} 100%{transform:translateX(-80px);opacity:0} }
        @keyframes larderEdge3 { 0%{transform:translateX(10%);opacity:0.45} 40%{opacity:0.95;transform:translateX(60%)} 100%{transform:translateX(10%);opacity:0.45} }
      `}</style>
      <div
        ref={ref}
        className="relative overflow-hidden rounded-3xl"
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
                Spiżarnia
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
              {fmtAmt(total, prefs.currency)}
            </p>
            {totalGLSent > 0 && (
              <div className="mt-3 flex items-center justify-center rounded-2xl border border-white/8 bg-white/3 px-4 py-2.5">
                <div className="text-center">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest">{t("larder.source_fund")}</p>
                  <p className="text-sm font-semibold text-white/55 tabular-nums">{fmtAmt(totalGLSent, prefs.currency)}</p>
                  <p className="text-[10px] text-white/25">{t("larder.transferred_gl")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className={`grid gap-2.5 ${inHousehold ? "grid-cols-3" : "grid-cols-2"}`}>
            <button
              onClick={() => setSpendOpen(true)}
              disabled={total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <PiggyBank className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">{t("larder.fund")}</span>
            </button>
            <button
              onClick={() => setDedicateOpen(true)}
              disabled={total <= 0}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium border border-white/10 bg-white/4 text-white/65 active:bg-white/10 transition-colors disabled:opacity-30"
            >
              <Target className="w-4 h-4 flex-shrink-0" />
              <span className="text-[11px] leading-tight text-center">{t("larder.support_btn")}</span>
            </button>
            {inHousehold && (
              <button
                onClick={() => setSendGlOpen(true)}
                disabled={total <= 0}
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
                  onClick={handleClearHistory}
                  className="flex items-center gap-1 text-[10px] text-white/25 active:text-red-400/70 transition-colors"
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
                          <p className="text-xs font-medium text-white/70 truncate">{e.note || sourceLabel(e.sourceType)}</p>
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
          <div className="space-y-1.5">
            <label className={labelCls}>
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(total, prefs.currency)}
            </label>
            <input type="number" step="0.01" min="0.01" max={total} required value={spendAmt}
              onChange={e => setSpendAmt(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
            <p className="text-xs text-white/25 leading-relaxed">
              {t("larder.from_larder_desc")}
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
                  {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(total, prefs.currency)}
                </label>
                <input type="number" step="0.01" min="0.01" max={total} required value={sendGlAmt}
                  onChange={e => setSendGlAmt(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputCls} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  {t("larder.percent_label")}{sendGlPct ? ` · ${fmtAmt((total * (parseFloat(sendGlPct) || 0)) / 100, prefs.currency)} ${t("larder.will_be_sent")}` : ""}
                </label>
                <input type="number" step="1" min="1" max="99" required value={sendGlPct}
                  onChange={e => setSendGlPct(e.target.value)} inputMode="decimal" placeholder="np. 25" className={inputCls} />
                <p className="text-xs text-white/30 leading-relaxed">
                  {t("larder.calc_sent_gl")}
                </p>
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
              {t("larder.amount_label")} · {t("larder.balance_lbl")}: {fmtAmt(total, prefs.currency)}
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
