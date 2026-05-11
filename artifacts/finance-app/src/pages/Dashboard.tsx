import { useState } from "react";
import {
  useGetSpendingSummary,
  useGetMonthlySummary,
  useGetRecentActivity,
  useCreateTransaction,
  useListCategories,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, TrendingDown, ArrowRight } from "lucide-react";
import { SiApplepay } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { format } from "date-fns";

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
        onClose();
      },
    },
  });

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("card");

  async function handleApplePay() {
    if (!window.PaymentRequest) {
      alert("Apple Pay is not supported in this browser.");
      return;
    }
    try {
      const request = new window.PaymentRequest(
        [{ supportedMethods: "https://apple.com/apple-pay", data: { version: 3, merchantIdentifier: "merchant.pocket.finance", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex"], countryCode: "US" } }],
        { total: { label: "Pocket Transaction", amount: { currency: "USD", value: amount || "0.00" } } }
      );
      const canMake = await request.canMakePayment();
      if (!canMake) { alert("Apple Pay is not available on this device."); return; }
      const paymentResponse = await request.show();
      const detail = paymentResponse.details;
      if (detail?.transaction?.amount) setAmount(detail.transaction.amount);
      setPaymentMethod("apple_pay");
      await paymentResponse.complete("success");
    } catch {
      // User dismissed — no action needed
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description || !date) return;
    create.mutate({
      data: {
        amount: parseFloat(amount),
        description,
        categoryId: categoryId ? parseInt(categoryId) : null,
        date,
        paymentMethod,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <div className="flex gap-2">
              <Input
                data-testid="input-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleApplePay} className="gap-2 px-3">
                <SiApplepay className="w-5 h-5" />
                Pay
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              data-testid="input-description"
              placeholder="Coffee, groceries, rent..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-category">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.color }} />
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
              <Input
                data-testid="input-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-payment">
                  <SelectValue />
                </SelectTrigger>
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
              {create.isPending ? "Adding..." : "Add Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLORS = ["#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8", "#a78bfa", "#fbbf24"];

export default function DashboardPage() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: spending, isLoading: spendingLoading } = useGetSpendingSummary({});
  const { data: monthly } = useGetMonthlySummary();
  const { data: recent } = useGetRecentActivity({ limit: 8 });

  const totalSpending = spending?.reduce((s, c) => s + c.total, 0) ?? 0;
  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{currentMonth}</p>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction-open" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Transaction
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground font-medium">Total Spent</p>
            <p className="text-3xl font-bold mt-1" data-testid="text-total-spent">${totalSpending.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground font-medium">Transactions</p>
            <p className="text-3xl font-bold mt-1" data-testid="text-tx-count">{spending?.reduce((s, c) => s + c.count, 0) ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground font-medium">Categories Used</p>
            <p className="text-3xl font-bold mt-1" data-testid="text-categories-count">{spending?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Active</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Spending by category donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {spendingLoading ? (
              <div className="h-52 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : spending && spending.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={spending} dataKey="total" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {spending.map((entry, i) => (
                        <Cell key={entry.categoryId ?? "unc"} fill={entry.categoryColor ?? COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {spending.slice(0, 6).map((item, i) => (
                    <div key={item.categoryId ?? "unc"} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.categoryColor ?? COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground truncate max-w-24">{item.categoryName}</span>
                      </div>
                      <span className="font-medium">${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <TrendingDown className="w-8 h-8 opacity-40" />
                <p className="text-sm">No spending data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthly ?? []} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Spent"]} />
                <Bar dataKey="total" fill="hsl(252 95% 67%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          <Link href="/transactions">
            <a className="text-sm text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </Link>
        </CardHeader>
        <CardContent>
          {recent && recent.length > 0 ? (
            <div className="divide-y divide-border">
              {recent.map(tx => (
                <div key={tx.id} data-testid={`row-transaction-${tx.id}`} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tx.categoryColor ?? "#94a3b8" }} />
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.categoryName ?? "Uncategorized"} &middot; {tx.date}</p>
                    </div>
                  </div>
                  <span className="font-semibold text-sm">${Number(tx.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions yet. Add your first one!</p>
          )}
        </CardContent>
      </Card>

      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
