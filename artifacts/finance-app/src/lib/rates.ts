const CACHE_KEY = "budger_rates_v2";
const SUPPORTED = ["USD", "EUR", "GBP", "PLN"] as const;
export type SupportedCurrency = typeof SUPPORTED[number];

export interface RatesCache {
  date: string;
  rates: Record<string, number>;
  updatedAt?: number;
}

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  PLN: 3.95,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCached(): RatesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: RatesCache = JSON.parse(raw);
    if (parsed.date === todayISO()) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveCache(rates: Record<string, number>): void {
  const cache: RatesCache = { date: todayISO(), rates, updatedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/**
 * Returns the epoch-ms timestamp of the last successful rates fetch, or null
 * if rates have never been fetched on this device. Reads the raw cache
 * regardless of whether it's still "fresh" for today — this is purely for
 * display ("last updated ...").
 */
export function getLastRatesUpdate(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: RatesCache = JSON.parse(raw);
    return typeof parsed.updatedAt === "number" ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

function loadAnyCache(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: RatesCache = JSON.parse(raw);
    return parsed.rates ?? null;
  } catch {
    return null;
  }
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
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
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
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.rates) throw new Error("unexpected response shape");
      return { USD: 1, ...json.rates } as Record<string, number>;
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
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          // Response uses lowercase currency codes: { usd: { eur, gbp, pln, … } }
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
  const cached = loadCached();
  if (cached) return cached.rates;
  return forceFetchRates();
}

/**
 * Fetch fresh rates, trying each provider in order.
 * Saves to localStorage on first success; falls back to any stale cache or
 * hardcoded constants if every provider fails.
 */
export async function forceFetchRates(): Promise<Record<string, number>> {
  for (const provider of providers) {
    try {
      const rates = await provider.fetch();
      saveCache(rates);
      return rates;
    } catch (err) {
      console.warn(`[rates] ${provider.name} failed, trying next provider`, err);
    }
  }
  // All providers failed — use stale cache if available, otherwise hardcoded fallback
  console.warn("[rates] All providers failed — using cached/fallback rates");
  return loadAnyCache() ?? FALLBACK_RATES;
}

/** Milliseconds until the next 12:00 AM or 12:00 PM local time. */
function msUntilNextHalfDay(): number {
  const now = new Date();
  const next = new Date(now);
  const h = now.getHours();
  if (h < 12) {
    next.setHours(12, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next.getTime() - now.getTime();
}

let _schedulerStarted = false;

/**
 * Start background rate refresh scheduler (idempotent).
 * - Immediately force-fetches fresh rates.
 * - Then re-fetches at every 12:00 AM and 12:00 PM local time.
 */
export function scheduleRateRefreshes(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  forceFetchRates().catch(() => {});

  function scheduleNext() {
    setTimeout(() => {
      forceFetchRates().catch(() => {});
      scheduleNext();
    }, msUntilNextHalfDay());
  }
  scheduleNext();
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
