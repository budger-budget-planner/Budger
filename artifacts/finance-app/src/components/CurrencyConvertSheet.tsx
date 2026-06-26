import { useState, useEffect } from "react";
import { useConvertTransactionCurrency, useLockTransactionCurrency } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fmtAmt } from "@/lib/prefs";

export function CurrencyConvertSheet({
  tx,
  accountCurrency,
  onClose,
  onConverted,
}: {
  tx: any;
  accountCurrency: string;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [rateError, setRateError] = useState(false);

  const convert = useConvertTransactionCurrency();
  const lock = useLockTransactionCurrency();

  const from = tx.transactionCurrency as string;
  const to = accountCurrency;

  useEffect(() => {
    setRateLoading(true);
    setRateError(false);
    setRate(null);
    fetch(`https://open.er-api.com/v6/latest/${from}`)
      .then(r => r.json())
      .then(data => {
        const r = data?.rates?.[to];
        if (typeof r === "number" && r > 0) {
          setRate(r);
        } else {
          setRateError(true);
        }
      })
      .catch(() => setRateError(true))
      .finally(() => setRateLoading(false));
  }, [from, to]);

  const preview = rate != null ? (Number(tx.amount) * rate).toFixed(2) : null;

  function handleConvert() {
    if (!rate) return;
    convert.mutate(
      { id: tx.id, data: { rate } },
      { onSuccess: () => { onConverted(); onClose(); } }
    );
  }

  function handleLock() {
    lock.mutate(
      { id: tx.id },
      { onSuccess: () => { onConverted(); onClose(); } }
    );
  }

  const busy = convert.isPending || lock.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Zmień walutę
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Ta transakcja została zarejestrowana w walucie{" "}
            <span className="font-semibold text-foreground">{from}</span>, ale Twoje konto jest w{" "}
            <span className="font-semibold text-foreground">{to}</span>.
          </p>

          <div className="rounded-lg bg-muted/40 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kwota oryginalna</span>
              <span className="font-semibold">{fmtAmt(Number(tx.amount), from)}</span>
            </div>
            {rateLoading && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kurs wymiany</span>
                <span className="text-muted-foreground animate-pulse">pobieranie…</span>
              </div>
            )}
            {rateError && (
              <div className="text-xs text-destructive">
                Nie udało się pobrać kursu. Wprowadź ręcznie:
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder={`1 ${from} = ? ${to}`}
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setRate(isNaN(v) || v <= 0 ? null : v);
                  }}
                />
              </div>
            )}
            {!rateLoading && rate != null && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kurs</span>
                  <span>1 {from} = {rate.toFixed(4)} {to}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">Po przeliczeniu</span>
                  <span className="font-bold text-foreground">{fmtAmt(Number(preview), to)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              disabled={busy || rateLoading || !rate}
              onClick={handleConvert}
            >
              {convert.isPending ? "Przeliczam…" : `Przelicz na ${to}`}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={handleLock}
            >
              {lock.isPending ? "Zapisuję…" : `Zostaw w ${from} na stałe`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Wybór jest nieodwracalny. Transakcja zablokowana w {from} nie zmieni się przy przyszłych konwersjach.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
