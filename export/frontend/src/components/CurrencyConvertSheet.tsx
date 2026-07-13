import { useState, useEffect } from "react";
import { useConvertTransactionCurrency, useLockTransactionCurrency } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fmtAmt } from "@/lib/prefs";
import { t } from "@/lib/i18n";
import { fetchRates, getConversionRate } from "@/lib/rates";

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
    fetchRates()
      .then(rates => {
        const r = getConversionRate(from, to, rates);
        if (r > 0) {
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
            {t("currency.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            {t("currency.recorded_in", { from, to }).split(from)[0]}
            <span className="font-semibold text-foreground">{from}</span>
            {t("currency.recorded_in", { from, to }).split(from)[1]?.split(to)[0]}
            <span className="font-semibold text-foreground">{to}</span>
            {t("currency.recorded_in", { from, to }).split(to).slice(1).join(to)}
          </p>

          <div className="rounded-lg bg-muted/40 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("currency.original_amount")}</span>
              <span className="font-semibold">{fmtAmt(Number(tx.amount), from)}</span>
            </div>
            {rateLoading && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("currency.exchange_rate")}</span>
                <span className="text-muted-foreground animate-pulse">{t("currency.fetching")}</span>
              </div>
            )}
            {rateError && (
              <div className="text-xs text-destructive">
                {t("currency.rate_failed")}
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
                  <span className="text-muted-foreground">{t("currency.rate_label")}</span>
                  <span>1 {from} = {rate.toFixed(4)} {to}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">{t("currency.converted_to")}</span>
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
              {convert.isPending ? t("currency.converting_btn") : t("currency.convert_btn", { to })}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={handleLock}
            >
              {lock.isPending ? t("currency.locking_btn") : t("currency.lock_btn", { from })}
            </Button>
          </div>

          {/* Consequence warning */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-zinc-300">{t("currency.warning_title")}</p>
            <ul className="text-xs text-zinc-400 space-y-1 list-none">
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 text-zinc-500">•</span>
                <span>{t("currency.warning_1")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 text-zinc-500">•</span>
                <span>{t("currency.warning_2")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 text-zinc-500">•</span>
                <span>{t("currency.warning_3")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 text-zinc-500">•</span>
                <span>{t("currency.warning_4")}</span>
              </li>
            </ul>
            <p className="text-xs text-zinc-500 pt-0.5">{t("currency.warning_final")}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
