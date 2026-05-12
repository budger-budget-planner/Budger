import { useState, useRef } from "react";
import {
  useListTransactions,
  useListCategories,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useUploadReceipt,
  useDeleteReceipt,
  getListTransactionsQueryKey,
  getGetSpendingSummaryQueryKey,
  getGetMonthlySummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSpendingHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Camera, X, ZoomIn, ImageOff, Image, ChevronLeft, ChevronRight } from "lucide-react";
import { SiApplepay } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

type TxFormState = {
  amount: string;
  description: string;
  categoryId: string;
  date: string;
  paymentMethod: string;
};

function TxForm({ initial, categories, onSubmit, onCancel, loading }: {
  initial: TxFormState;
  categories: any[];
  onSubmit: (data: TxFormState) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TxFormState>(initial);
  function set(k: keyof TxFormState, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleApplePay() {
    if (!window.PaymentRequest) { alert("Apple Pay not supported."); return; }
    try {
      const req = new window.PaymentRequest(
        [{ supportedMethods: "https://apple.com/apple-pay", data: { version: 3, merchantIdentifier: "merchant.budger.app", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex"], countryCode: "US" } }],
        { total: { label: "Budger", amount: { currency: "USD", value: form.amount || "0.00" } } }
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
          <Input data-testid="input-amount" type="number" step="0.01" min="0" placeholder="0.00"
            value={form.amount} onChange={e => set("amount", e.target.value)} required className="flex-1" />
          <Button type="button" variant="outline" onClick={handleApplePay} className="gap-2 px-3">
            <SiApplepay className="w-5 h-5" /> Pay
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input data-testid="input-description" placeholder="Coffee, groceries…"
          value={form.description} onChange={e => set("description", e.target.value)} required />
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
          <Input data-testid="input-date" type="date" value={form.date}
            onChange={e => set("date", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Payment</Label>
          <Select value={form.paymentMethod} onValueChange={v => set("paymentMethod", v)}>
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
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={loading} data-testid="button-save-transaction">
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function ReceiptModal({ tx, open, onClose }: { tx: any; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const cameraRef  = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const uploadReceipt = useUploadReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});
  const deleteReceipt = useDeleteReceipt({ mutation: { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  }}});

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const imageData = ev.target?.result as string;
      if (imageData) uploadReceipt.mutate({ id: tx.id, data: { imageData } });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <>
      <Dialog open={open && !lightbox} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt — {tx.description}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">${Number(tx.amount).toFixed(2)}</span>
              {" "}· {tx.categoryName ?? "Uncategorized"} · {tx.date}
            </div>
            {tx.receiptImage ? (
              <div className="relative group rounded-xl overflow-hidden border border-border">
                <img src={tx.receiptImage} alt="Receipt"
                  className="w-full object-cover max-h-64 cursor-pointer"
                  onClick={() => setLightbox(true)} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors
                                flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" onClick={() => setLightbox(true)} className="gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" /> View
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => deleteReceipt.mutate({ id: tx.id })}
                    disabled={deleteReceipt.isPending} className="gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                </div>
                {(uploadReceipt.isPending || deleteReceipt.isPending) && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
                <ImageOff className="w-8 h-8 opacity-40" />
                <p className="text-sm text-center">No receipt attached yet.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2"
                onClick={() => cameraRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Camera className="w-4 h-4" /> Camera
              </Button>
              <Button variant="outline" className="gap-2"
                onClick={() => libraryRef.current?.click()} disabled={uploadReceipt.isPending}>
                <Image className="w-4 h-4" /> Library
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && tx.receiptImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(false)}>
            <X className="w-6 h-6" />
          </button>
          <img src={tx.receiptImage} alt="Receipt full size"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileChange} />
      <input ref={libraryRef} type="file" accept="image/*"
        className="hidden" onChange={handleFileChange} />
    </>
  );
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMonthlySummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSpendingHistoryQueryKey() });
}

export default function HomeSpending() {
  const queryClient = useQueryClient();
  const [viewDate, setViewDate] = useState(new Date());
  const [addOpen, setAddOpen]     = useState(false);
  const [editTx, setEditTx]       = useState<any | null>(null);
  const [receiptTx, setReceiptTx] = useState<any | null>(null);
  const [actionTx, setActionTx]   = useState<number | null>(null);

  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const fromStr    = format(monthStart, "yyyy-MM-dd");
  const toStr      = format(monthEnd,   "yyyy-MM-dd");
  const isCurrentMonth = format(viewDate, "yyyy-MM") === format(new Date(), "yyyy-MM");

  const { data: categories } = useListCategories();
  const { data: transactions, isLoading } = useListTransactions({ from: fromStr, to: toStr } as any);

  const create = useCreateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setAddOpen(false); } } });
  const update = useUpdateTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setEditTx(null); } } });
  const remove = useDeleteTransaction({ mutation: { onSuccess: () => { invalidateAll(queryClient); setActionTx(null); } } });

  const sorted = [...(transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total  = sorted.reduce((s, tx) => s + Number(tx.amount), 0);

  const blank: TxFormState = {
    amount: "", description: "", categoryId: "none",
    date: format(new Date(), "yyyy-MM-dd"), paymentMethod: "card",
  };

  function handleCreate(form: TxFormState) {
    create.mutate({ data: {
      amount: parseFloat(form.amount),
      description: form.description,
      categoryId: form.categoryId !== "none" ? parseInt(form.categoryId) : null,
      date: form.date,
      paymentMethod: form.paymentMethod,
    }});
  }

  function handleUpdate(form: TxFormState) {
    if (!editTx) return;
    update.mutate({ id: editTx.id, data: {
      amount: parseFloat(form.amount),
      description: form.description,
      categoryId: form.categoryId !== "none" ? parseInt(form.categoryId) : null,
      date: form.date,
      paymentMethod: form.paymentMethod,
    }});
  }

  /* Group transactions by date */
  const grouped: Record<string, typeof sorted> = {};
  for (const tx of sorted) {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Month header ── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center transition active:scale-90">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{format(viewDate, "MMMM yyyy")}</p>
            {isCurrentMonth && <p className="text-xs text-muted-foreground">current month</p>}
          </div>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            disabled={isCurrentMonth}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center transition active:scale-90 disabled:opacity-30">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Total spent */}
        <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Total spent</p>
            <p className="text-3xl font-bold text-foreground">${total.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Entries</p>
            <p className="text-3xl font-bold text-foreground">{sorted.length}</p>
          </div>
        </div>
      </div>

      {/* ── Transaction list ── */}
      <div className="flex-1 px-5 space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <p className="text-sm">No spending logged for this month.</p>
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Add first entry
            </Button>
          </div>
        ) : (
          dates.map(date => (
            <div key={date}>
              {/* Date group header */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {format(new Date(date + "T12:00:00"), "EEE, d MMM")}
              </p>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {grouped[date].map(tx => (
                  <div key={tx.id}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted/40"
                    onClick={() => setActionTx(actionTx === tx.id ? null : tx.id)}
                  >
                    {/* Category colour dot */}
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: (tx.categoryColor ?? "#444") + "33" }}>
                      <div className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tx.categoryColor ?? "#666" }} />
                    </div>
                    {/* Description + category */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.categoryName ?? "Uncategorized"}
                        {tx.receiptImage ? " · 📎" : ""}
                      </p>
                    </div>
                    {/* Amount */}
                    <p className="text-sm font-semibold text-foreground flex-shrink-0">
                      −${Number(tx.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action row for selected tx */}
              {grouped[date].some(tx => tx.id === actionTx) && (() => {
                const tx = grouped[date].find(t => t.id === actionTx)!;
                return (
                  <div className="mt-1 flex gap-2 px-1">
                    <button onClick={() => { setReceiptTx(tx); setActionTx(null); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                 bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                      <Camera className="w-3.5 h-3.5" /> Receipt
                    </button>
                    <button onClick={() => { setEditTx(tx); setActionTx(null); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                 bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => remove.mutate({ id: tx.id })}
                      disabled={remove.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                                 bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70 disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                );
              })()}
            </div>
          ))
        )}
      </div>

      {/* ── Floating add button ── */}
      <button
        onClick={() => setAddOpen(true)}
        data-testid="button-add-transaction"
        className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-foreground text-background
                   shadow-xl flex items-center justify-center transition active:scale-90"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Add dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
          <TxForm initial={blank} categories={categories ?? []} onSubmit={handleCreate}
            onCancel={() => setAddOpen(false)} loading={create.isPending} />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTx} onOpenChange={() => setEditTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          {editTx && (
            <TxForm
              initial={{ amount: String(editTx.amount), description: editTx.description,
                categoryId: editTx.categoryId ? String(editTx.categoryId) : "none",
                date: editTx.date, paymentMethod: editTx.paymentMethod }}
              categories={categories ?? []}
              onSubmit={handleUpdate}
              onCancel={() => setEditTx(null)}
              loading={update.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Receipt modal ── */}
      {receiptTx && (
        <ReceiptModal tx={receiptTx} open={!!receiptTx} onClose={() => setReceiptTx(null)} />
      )}
    </div>
  );
}
