import { useState } from "react";
import {
  useListTransactions,
  useListCategories,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { SiApplepay } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

type TxFormState = {
  amount: string;
  description: string;
  categoryId: string;
  date: string;
  paymentMethod: string;
};

function TxForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: TxFormState;
  categories: any[];
  onSubmit: (data: TxFormState) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TxFormState>(initial);

  function set(k: keyof TxFormState, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleApplePay() {
    if (!window.PaymentRequest) { alert("Apple Pay not supported in this browser."); return; }
    try {
      const req = new window.PaymentRequest(
        [{ supportedMethods: "https://apple.com/apple-pay", data: { version: 3, merchantIdentifier: "merchant.pocket.finance", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex"], countryCode: "US" } }],
        { total: { label: "Pocket", amount: { currency: "USD", value: form.amount || "0.00" } } }
      );
      if (!await req.canMakePayment()) { alert("Apple Pay not available."); return; }
      const pr = await req.show();
      set("paymentMethod", "apple_pay");
      await pr.complete("success");
    } catch { /* dismissed */ }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Amount</Label>
        <div className="flex gap-2">
          <Input
            data-testid="input-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.amount}
            onChange={e => set("amount", e.target.value)}
            required
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={handleApplePay} className="gap-2 px-3">
            <SiApplepay className="w-5 h-5" /> Pay
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input data-testid="input-description" placeholder="Coffee, groceries..." value={form.description} onChange={e => set("description", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
          <SelectTrigger data-testid="select-category"><SelectValue placeholder="No category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {categories.map(c => (
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
          <Input data-testid="input-date" type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Payment</Label>
          <Select value={form.paymentMethod} onValueChange={v => set("paymentMethod", v)}>
            <SelectTrigger data-testid="select-payment"><SelectValue /></SelectTrigger>
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
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={loading} data-testid="button-save-transaction">
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
}

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTx, setEditTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: categories } = useListCategories();
  const { data: transactions, isLoading } = useListTransactions(
    filterCat !== "all" ? { categoryId: parseInt(filterCat) } : {}
  );

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setAddOpen(false); } } });
  const update = useUpdateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setEditTx(null); } } });
  const remove = useDeleteTransaction({ mutation: { onSuccess: () => invalidateAll(queryClient) } });

  const filtered = (transactions ?? []).filter(tx => {
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (startDate && tx.date < startDate) return false;
    if (endDate && tx.date > endDate) return false;
    return true;
  });

  const blank: TxFormState = { amount: "", description: "", categoryId: "none", date: format(new Date(), "yyyy-MM-dd"), paymentMethod: "card" };

  function handleCreate(form: TxFormState) {
    create.mutate({ data: { amount: parseFloat(form.amount), description: form.description, categoryId: form.categoryId !== "none" ? parseInt(form.categoryId) : null, date: form.date, paymentMethod: form.paymentMethod } });
  }

  function handleUpdate(form: TxFormState) {
    if (!editTx) return;
    update.mutate({ id: editTx.id, data: { amount: parseFloat(form.amount), description: form.description, categoryId: form.categoryId !== "none" ? parseInt(form.categoryId) : null, date: form.date, paymentMethod: form.paymentMethod } });
  }

  const paymentLabel: Record<string, string> = { card: "Card", apple_pay: "Apple Pay", cash: "Cash", bank_transfer: "Bank Transfer" };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-transaction" className="gap-2">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input data-testid="input-search" placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44" data-testid="select-filter-category"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input data-testid="input-start-date" type="date" placeholder="From" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
        <Input data-testid="input-end-date" type="date" placeholder="To" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No transactions found.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="divide-y divide-border">
            {filtered.map(tx => (
              <div key={tx.id} data-testid={`row-transaction-${tx.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tx.categoryColor ?? "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.categoryName ?? "Uncategorized"} &middot; {paymentLabel[tx.paymentMethod] ?? tx.paymentMethod} {tx.userName ? `· ${tx.userName}` : ""}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{tx.date}</span>
                <span className="font-semibold text-sm w-20 text-right flex-shrink-0">${Number(tx.amount).toFixed(2)}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="w-7 h-7" data-testid={`button-edit-transaction-${tx.id}`} onClick={() => setEditTx(tx)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" data-testid={`button-delete-transaction-${tx.id}`} onClick={() => remove.mutate({ id: tx.id })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
          <TxForm initial={blank} categories={categories ?? []} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} loading={create.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          {editTx && (
            <TxForm
              initial={{ amount: String(editTx.amount), description: editTx.description, categoryId: editTx.categoryId ? String(editTx.categoryId) : "none", date: editTx.date, paymentMethod: editTx.paymentMethod }}
              categories={categories ?? []}
              onSubmit={handleUpdate}
              onCancel={() => setEditTx(null)}
              loading={update.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
