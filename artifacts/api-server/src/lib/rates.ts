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

// ---------------------------------------------------------------------------
// Rate providers — tried in order; first success wins.
// 1. ExchangeRate-API  — free, no key, updates every 12 h  (most frequent)
// 2. Frankfurter       — ECB-backed, free, no key, updates once per business day
// 3. fawazahmed0       — open-source, served from jsDelivr CDN + CF Pages mirror
// ---------------------------------------------------------------------------

interface RateProvider {
  name: string;
  fetch: () => Promise<Record<string, number>>;
}

const providers: RateProvider[] = [
  {
    // Primary: updates every 12 hours — https://www.exchangerate-api.com/
    name: "ExchangeRate-API",
    async fetch() {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };
      if (json.result !== "success" || !json.rates)
        throw new Error("unexpected response shape");
      const rates: Record<string, number> = { USD: 1 };
      for (const sym of SUPPORTED) {
        if (sym !== "USD" && typeof json.rates[sym] === "number")
          rates[sym] = json.rates[sym];
      }
      return rates;
    },
  },
  {
    // Fallback 1: ECB data — https://www.frankfurter.app/
    name: "Frankfurter",
    async fetch() {
      const res = await fetch(
        "https://api.frankfurter.app/latest?base=USD&symbols=EUR,GBP,PLN",
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { rates?: Record<string, number> };
      if (!json.rates) throw new Error("unexpected response shape");
      return { USD: 1, ...json.rates };
    },
  },
  {
    // Fallback 2: open-source GitHub project, two CDN mirrors for extra safety
    // https://github.com/fawazahmed0/exchange-api
    name: "fawazahmed0",
    async fetch() {
      const mirrors = [
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
        "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
      ];
      let lastErr: unknown;
      for (const url of mirrors) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Response uses lowercase currency codes: { usd: { eur, gbp, pln, … } }
          const json = (await res.json()) as { usd?: Record<string, number> };
          const usd = json.usd;
          if (!usd) throw new Error("unexpected response shape");
          const rates: Record<string, number> = { USD: 1 };
          for (const sym of SUPPORTED) {
            if (sym !== "USD" && typeof usd[sym.toLowerCase()] === "number")
              rates[sym] = usd[sym.toLowerCase()];
          }
          return rates;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    },
  },
];

export async function fetchRates(): Promise<Record<string, number>> {
  if (cache && cache.date === todayISO()) return cache.rates;

  for (const provider of providers) {
    try {
      const rates = await provider.fetch();
      cache = { date: todayISO(), rates };
      return rates;
    } catch (err) {
      logger.warn({ err, provider: provider.name }, "Rate provider failed, trying next");
    }
  }

  // All providers failed — return stale cache if available, otherwise hardcoded fallback
  logger.warn("All rate providers failed — using cached/fallback rates");
  return cache?.rates ?? FALLBACK_RATES;
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
