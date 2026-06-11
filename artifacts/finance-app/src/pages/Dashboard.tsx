import { useState } from "react";
import {
  useGetSpendingSummary,
  useGetMonthlySummary,
  useGetRecentActivity,
  useGetSpendingHistory,
  useCreateTransaction,
  useListCategories,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getListTransactionsQueryKey,
  getGetSpendingHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, TrendingDown, ArrowRight, History, ChevronDown, ChevronRight, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { format } from "date-fns";

const CHART_COLORS = ["#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8", "#a78bfa", "#fbbf24"];

/* ── Add transaction dialog (no Apple Pay button — user logs what they already paid) ── */
function AddTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: categories } = useListCategories();
  const create = useCreateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSpendingHistoryQueryKey() });
        onClose();
      },
    },
  });

  const [amount, setAmount]           = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId]   = useState("");
  const [date, setDate]               = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("card");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description || !date) return;
    create.mutate({
      data: {
        amount: parseFloat(amount),
        description,
        categoryId: categoryId && categoryId !== "none" ? parseInt(categoryId) : null,
        date,
        paymentMethod,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              data-testid="input-amount"
              type="number" step="0.01" min="0" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              data-testid="input-description"
              placeholder="Coffee, groceries…"
              value={description} onChange={e => setDescription(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-category"><SelectValue placeholder="No category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input data-testid="input-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Payment</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="apple_pay">Apple Pay</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={create.isPending} data-testid="button-add-transaction">
              {create.isPending ? "Adding…" : "Add Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BudgetBar({ spent, budget, color }: { spent: number; budget: number; color: string }) {
  const pct = Math.min((spent / budget) * 100, 100);
  return (
    <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: spent > budget ? "#f87171" : color }} />
    </div>
  );
}

function HistorySection() {
  const { data: history, isLoading } = useGetSpendingHistory();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-8">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!history || history.length === 0) return (
    <p className="text-sm text-muted-foreground text-center py-6">No spending history yet.</p>
  );

  return (
    <div className="space-y-2">
      {history.map(m => (
        <div key={m.monthKey} className="border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors"
            onClick={() => setExpanded(e => e === m.monthKey ? null : m.monthKey)}
          >
            <div className="flex items-center gap-2">
              {expanded === m.monthKey
                ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <span className="font-medium text-sm">{m.month} {m.year}</span>
              <span className="text-xs text-muted-foreground">{m.count} tx</span>
            </div>
            <span className="font-semibold text-sm">${m.total.toFixed(2)}</span>
          </button>
          {expanded === m.monthKey && (
            <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
              {m.categories.map((cat, i) => (
                <div key={cat.categoryId ?? "unc"} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground">{cat.categoryName}</span>
                      {cat.budget && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${cat.total > cat.budget ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                          {cat.total > cat.budget ? "Over" : `${Math.round((cat.total / cat.budget) * 100)}%`}
                        </span>
                      )}
                    </div>
                    <span className="font-medium">${cat.total.toFixed(2)}</span>
                  </div>
                  {cat.budget && <BudgetBar spent={cat.total} budget={cat.budget} color={cat.categoryColor ?? "#818cf8"} />}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [addOpen, setAddOpen]       = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: spending, isLoading: spendingLoading } = useGetSpendingSummary({});
  const { data: monthly }  = useGetMonthlySummary();
  const { data: recent }   = useGetRecentActivity({ limit: 8 });

  const totalSpending = spending?.reduce((s, c) => s + c.total, 0) ?? 0;
  const totalBudget   = spending?.reduce((s, c) => s + (c.budget ?? 0), 0) ?? 0;
  const txCount       = spending?.reduce((s, c) => s + c.count, 0) ?? 0;
  const overBudget    = spending?.filter(c => c.budget != null && c.total > c.budget).length ?? 0;
  const currentMonth  = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="px-4 pt-4 pb-4 max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">{currentMonth}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          data-testid="button-add-transaction-open"
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* ── Compact stats strip ── */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {/* Total spent */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total spent</p>
          <p className="text-2xl font-bold" data-testid="text-total-spent">${totalSpending.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">this month</p>
        </div>

        {/* Budget used */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Budget</p>
          {totalBudget > 0 ? (
            <>
              <p className="text-2xl font-bold">{Math.round((totalSpending / totalBudget) * 100)}%</p>
              <div className="mt-1 space-y-0.5">
                <BudgetBar spent={totalSpending} budget={totalBudget} color="#818cf8" />
                <p className="text-xs text-muted-foreground">${totalSpending.toFixed(0)} of ${totalBudget.toFixed(0)}</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">—</p>
              <p className="text-xs text-muted-foreground">no budgets set</p>
            </>
          )}
        </div>

        {/* Transactions */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Transactions</p>
          <p className="text-2xl font-bold">{txCount}</p>
          <p className="text-xs text-muted-foreground">this month</p>
        </div>

        {/* Over budget */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Over budget</p>
          <p className={`text-2xl font-bold ${overBudget > 0 ? "text-destructive" : ""}`}>{overBudget}</p>
          <p className="text-xs text-muted-foreground">{overBudget > 0 ? "categories" : "all on track"}</p>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="space-y-4 mb-5">
        {/* Donut + legend */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">Spending by Category</p>
          {spendingLoading ? (
            <div className="h-44 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : spending && spending.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={spending} dataKey="total" cx="50%" cy="50%"
                      innerRadius={38} outerRadius={64} paddingAngle={2}>
                      {spending.map((entry, i) => (
                        <Cell key={entry.categoryId ?? "unc"}
                          fill={entry.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {spending.slice(0, 6).map((item, i) => (
                  <div key={item.categoryId ?? "unc"} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground truncate">{item.categoryName}</span>
                        {item.budget != null && item.total > item.budget && (
                          <span className="text-destructive font-medium flex-shrink-0">!</span>
                        )}
                      </div>
                      <span className="font-semibold ml-2 flex-shrink-0">${item.total.toFixed(2)}</span>
                    </div>
                    {item.budget != null && (
                      <BudgetBar spent={item.total} budget={item.budget}
                        color={item.categoryColor ?? CHART_COLORS[i % CHART_COLORS.length]} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <TrendingDown className="w-8 h-8 opacity-30" />
              <p className="text-sm">No spending data yet</p>
            </div>
          )}
        </div>

        {/* Monthly trend bar */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold mb-3">Monthly Trend</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Spent"]}
                contentStyle={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="total" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── History toggle ── */}
      <button
        onClick={() => setHistoryOpen(h => !h)}
        className="w-full flex items-center justify-between px-4 py-3 mb-4
                   bg-card border border-border rounded-2xl text-sm font-medium
                   transition active:opacity-70"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span>Spending History</span>
        </div>
        {historyOpen
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {historyOpen && (
        <div className="mb-4">
          <HistorySection />
        </div>
      )}

      {/* ── Recent activity ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Recent Activity</p>
          <Link href="/transactions">
            <span className="text-xs text-primary flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
        {recent && recent.length > 0 ? (
          <div className="divide-y divide-border">
            {recent.map(tx => (
              <div key={tx.id} data-testid={`row-transaction-${tx.id}`}
                className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: (tx.categoryColor ?? "#444") + "22" }}>
                    <div className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: tx.categoryColor ?? "#666" }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      {tx.receiptImage && <Camera className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {tx.categoryName ?? "Uncategorized"} · {tx.date}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-sm flex-shrink-0 ml-3">
                  ${Number(tx.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">
            No transactions yet. Add your first one!
          </p>
        )}
      </div>

      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
