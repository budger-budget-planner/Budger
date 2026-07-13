// Shared helpers for "Asset" (source currency sub-balance) selection when
// debiting money FROM the personal Larder or the household Great Larder.
//
// Both ledgers can hold entries in multiple currencies at once (a user may
// have switched their account currency over time). Rather than guessing
// which sub-balance a debit should draw from, the client explicitly picks
// an "Asset" (currency) via a dropdown, and the server validates that the
// chosen sub-balance actually has enough funds before allowing the action.

const EPS = 0.005;

export interface CurrencyBalance {
  currency: string;
  amount: number;
}

export class AssetSelectionError extends Error {}

/** Groups ledger rows (larder or great-larder entries) by currency and sums amounts. */
export function currencyBalances(entries: { currency: string; amount: string }[]): CurrencyBalance[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.currency, (map.get(e.currency) ?? 0) + parseFloat(e.amount));
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }));
}

/**
 * Resolves which currency sub-balance ("Asset") a debit should draw from.
 *  - If `assetCurrency` is given, it must have a positive balance.
 *  - If omitted and there's exactly one currency with a positive balance,
 *    that one is used automatically (mirrors the frontend auto-selecting/
 *    disabling the dropdown when there's only one option).
 *  - If omitted and there are multiple currencies with a balance, the
 *    caller must pick one explicitly.
 * Throws AssetSelectionError with a user-facing message on any failure.
 */
export function resolveAssetCurrency(balances: CurrencyBalance[], assetCurrency?: string): string {
  const positive = balances.filter(b => b.amount > EPS);
  if (positive.length === 0) {
    throw new AssetSelectionError("Insufficient balance");
  }
  if (assetCurrency) {
    if (!positive.some(b => b.currency === assetCurrency)) {
      throw new AssetSelectionError(`No available balance in ${assetCurrency}`);
    }
    return assetCurrency;
  }
  if (positive.length === 1) return positive[0].currency;
  throw new AssetSelectionError("Please select which currency to use");
}

/** Rounds to 2 decimal places (matches numeric(_, 2) DB columns). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Validates that the chosen asset's native balance can cover `nativeAmount`
 * (already denominated in the asset's own currency). Throws
 * AssetSelectionError — the caller should turn this into a 400 response —
 * so an action can never overdraw a sub-balance.
 */
export function assertSufficientAssetBalance(
  balances: CurrencyBalance[],
  assetCurrency: string,
  nativeAmount: number,
): number {
  const bal = balances.find(b => b.currency === assetCurrency)?.amount ?? 0;
  if (nativeAmount > bal + EPS) {
    throw new AssetSelectionError(`Insufficient balance in ${assetCurrency}`);
  }
  return bal;
}
