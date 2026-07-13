// Server-side currency conversion, mirroring the frontend's rates.ts logic.
// Used to validate/compare amounts across currencies (e.g. legacy goal
// contributions that predate the accountAmount/accountCurrency snapshot
// columns, or any other cross-currency comparison needed server-side).
import { logger } from "./logger";

const SUPPORTED = ["USD", "EUR", "GBP", "PLN"] as const;

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  PLN: 3.95,
};

let cache: { date: string; rates: Record<string, number> } | null = null;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchRates(): Promise<Record<string, number>> {
  if (cache && cache.date === todayISO()) return cache.rates;

  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?base=USD&symbols=EUR,GBP,PLN",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error("fetch failed");
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rates: Record<string, number> = { USD: 1, ...json.rates };
    cache = { date: todayISO(), rates };
    return rates;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch exchange rates, using fallback/cached rates");
    return cache?.rates ?? FALLBACK_RATES;
  }
}

export function getConversionRate(
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  const fromRate = rates[from] ?? FALLBACK_RATES[from] ?? 1;
  const toRate = rates[to] ?? FALLBACK_RATES[to] ?? 1;
  return toRate / fromRate;
}

export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return amount;
  return amount * getConversionRate(from, to, rates);
}

export const SUPPORTED_CURRENCIES = SUPPORTED;
