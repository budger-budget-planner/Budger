import { useState } from "react";
import { t } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListGoals } from "@workspace/api-client-react";
import { loadPrefs, currencySymbol, fmtAmt } from "@/lib/prefs";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, PiggyBank, Target, TrendingUp, TrendingDown,
  ArrowRightCircle, Plus, X,
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
  if (sourceType === "recurring_payment") return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (sourceType === "larder_fund")       return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (sourceType === "goal_dedication")   return <Target className="w-4 h-4 text-muted-foreground" />;
  if (sourceType === "great_larder_transfer") return <ArrowRightCircle className="w-4 h-4 text-muted-foreground" />;
  return positive
    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
    : <TrendingDown className="w-4 h-4 text-red-400" />;
}

// ── Bottom sheet wrapper ─────────────────────────────────────────────────────
function Sheet({
  title, open, onClose, children,
}: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border rounded-t-3xl px-5 pt-6 pb-10 max-h-[88vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <p className="text-lg font-bold">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-95">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export default function LarderTab() {
  const prefs = loadPrefs();
  const sym = currencySymbol(prefs.currency);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: larder, isLoading } = useQuery<LarderSummary>({
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

  // ── Sheet state ──────────────────────────────────────────────────────────
  const [addOpen,       setAddOpen]       = useState(false);
  const [fundOpen,      setFundOpen]      = useState(false);
  const [dedicateOpen,  setDedicateOpen]  = useState(false);

  // Add entry form
  const [addAmount,     setAddAmount]     = useState("");
  const [addNote,       setAddNote]       = useState("");
  const [addLoading,    setAddLoading]    = useState(false);

  // Fund form
  const [fundDesc,      setFundDesc]      = useState("");
  const [fundTotal,     setFundTotal]     = useState("");
  const [fundPortion,   setFundPortion]   = useState("");
  const [fundLoading,   setFundLoading]   = useState(false);

  // Dedicate form
  const [dedGoalId,     setDedGoalId]     = useState<number | null>(null);
  const [dedAmount,     setDedAmount]     = useState("");
  const [dedLoading,    setDedLoading]    = useState(false);

  const total   = larder?.total ?? 0;
  const entries = larder?.entries ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["larder"] });
  }

  // ── Add entry handler ────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(addAmount);
    if (isNaN(amt) || amt <= 0) return;
    setAddLoading(true);
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/larder/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: amt, currency: prefs.currency, sourceType: "manual", note: addNote.trim() || null }),
      });
      if (!r.ok) throw new Error("Failed");
      invalidate();
      setAddOpen(false);
      setAddAmount(""); setAddNote("");
      toast({ title: t("larder.add_success") });
    } catch {
      toast({ title: "Failed to add entry", variant: "destructive" });
    } finally { setAddLoading(false); }
  }

  // ── Fund handler ─────────────────────────────────────────────────────────
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

  // ── Dedicate handler ─────────────────────────────────────────────────────
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Balance card ── */}
      <div className="rounded-3xl bg-card border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-foreground/10 flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {t("larder.balance")}
            </p>
            <p className="text-xs text-muted-foreground">{t("larder.subtitle")}</p>
          </div>
        </div>
        <p className="text-4xl font-bold tabular-nums tracking-tight mb-1">
          {sym}{fmtAmt(total, prefs.currency).replace(/^[^0-9-]*/,"").replace(sym, "")}
        </p>
        <p className="text-sm text-muted-foreground">{prefs.currency}</p>
      </div>

      {/* ── Quick action row ── */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-card border border-border
                     transition active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
            <Plus className="w-4.5 h-4.5 text-foreground" />
          </div>
          <span className="text-xs font-medium text-center leading-tight">{t("larder.add_entry")}</span>
        </button>
        <button
          onClick={() => setFundOpen(true)}
          className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-card border border-border
                     transition active:scale-95"
        >
          <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
            <PiggyBank className="w-4.5 h-4.5 text-foreground" />
          </div>
          <span className="text-xs font-medium text-center leading-tight">{t("larder.fund")}</span>
        </button>
        <button
          onClick={() => setDedicateOpen(true)}
          disabled={total <= 0}
          className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-card border border-border
                     transition active:scale-95 disabled:opacity-40"
        >
          <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
            <Target className="w-4.5 h-4.5 text-foreground" />
          </div>
          <span className="text-xs font-medium text-center leading-tight">{t("larder.dedicate")}</span>
        </button>
      </div>

      {/* ── Recent activity ── */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center">
          <Warehouse className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {t("larder.empty")}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">{t("larder.recent")}</p>
          </div>
          <div className="divide-y divide-border">
            {entries.slice(0, 30).map(e => {
              const positive = e.amount >= 0;
              const d = new Date(e.createdAt);
              const dateStr = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <EntryIcon sourceType={e.sourceType} positive={positive} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {e.note || sourceLabel(e.sourceType)}
                    </p>
                    <p className="text-xs text-muted-foreground">{dateStr} · {sourceLabel(e.sourceType)}</p>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${positive ? "text-emerald-400" : "text-red-400"}`}>
                    {positive ? "+" : "−"}{sym}{Math.abs(e.amount).toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add entry sheet ── */}
      <Sheet title={t("larder.add_sheet_title")} open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.amount_label")} ({prefs.currency})</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={addAmount} onChange={e => setAddAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.description")} ({t("common.optional") ?? "optional"})</label>
            <input
              type="text"
              value={addNote} onChange={e => setAddNote(e.target.value)}
              placeholder={t("larder.description")}
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <button type="submit" disabled={addLoading}
            className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {addLoading ? "…" : t("common.save")}
          </button>
        </form>
      </Sheet>

      {/* ── Fund Larder sheet ── */}
      <Sheet title={t("larder.fund_sheet_title")} open={fundOpen} onClose={() => setFundOpen(false)}>
        <form onSubmit={handleFund} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.description")}</label>
            <input
              type="text" required
              value={fundDesc} onChange={e => setFundDesc(e.target.value)}
              placeholder={t("larder.description")}
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.amount_label")} ({prefs.currency})</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={fundTotal} onChange={e => setFundTotal(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.larder_portion")} ({prefs.currency})</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={fundPortion} onChange={e => setFundPortion(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
            <p className="text-xs text-muted-foreground">
              Full amount appears in your transaction list; only this portion goes to the Larder.
            </p>
          </div>
          <button type="submit" disabled={fundLoading}
            className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {fundLoading ? "…" : t("larder.fund")}
          </button>
        </form>
      </Sheet>

      {/* ── Dedicate to goal sheet ── */}
      <Sheet title={t("larder.dedicate_sheet_title")} open={dedicateOpen} onClose={() => setDedicateOpen(false)}>
        <form onSubmit={handleDedicate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t("larder.select_goal")}</label>
            {(goals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("larder.no_goals")}</p>
            ) : (
              <div className="space-y-2">
                {(goals ?? []).map((g: any) => (
                  <button
                    key={g.id} type="button"
                    onClick={() => setDedGoalId(g.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
                      dedGoalId === g.id ? "border-foreground bg-foreground/10" : "border-border bg-muted"
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color ?? "#818cf8" }} />
                    <p className="text-sm font-medium truncate text-left">{g.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {t("larder.amount_label")} ({prefs.currency}) · {t("larder.balance")}: {sym}{total.toFixed(2)}
            </label>
            <input
              type="number" step="0.01" min="0.01" max={total} required
              value={dedAmount} onChange={e => setDedAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <button type="submit" disabled={dedLoading || !dedGoalId || (goals ?? []).length === 0}
            className="w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm transition active:scale-95 disabled:opacity-50">
            {dedLoading ? "…" : t("larder.dedicate")}
          </button>
        </form>
      </Sheet>
    </div>
  );
}
