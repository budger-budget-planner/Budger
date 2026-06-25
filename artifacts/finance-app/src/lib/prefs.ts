export type AppPrefs = {
  currency: string;
  language: string;
  totalBudget: number | null;
  staySignedIn: boolean;
};

const PREFS_KEY     = "budger_prefs_v1";
const ONBOARDED_KEY = "budger_onboarded_v1";
const SESSION_KEY   = "budger_session";

const DEFAULT_PREFS: AppPrefs = {
  currency: "USD",
  language: "en",
  totalBudget: null,
  staySignedIn: true,
};

export function loadPrefs(): AppPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") ?? {};
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: AppPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

export function isOnboardingDone(): boolean {
  return !!localStorage.getItem(ONBOARDED_KEY);
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

/**
 * Mark that the user has an active browser session (call on login).
 * If staySignedIn=false, we use sessionStorage so it clears when the tab closes.
 */
export function markSession() {
  sessionStorage.setItem(SESSION_KEY, "1");
}

/**
 * Returns true if the session is still live in this browser window.
 * A "no" means the user closed the tab / restarted without staySignedIn.
 */
export function hasActiveSession(): boolean {
  return !!sessionStorage.getItem(SESSION_KEY);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function currencySymbol(currency: string): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", PLN: "zł",
  };
  return map[currency] ?? currency;
}

export function fmtAmt(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  if (currency === "PLN") return `${amount.toFixed(2)}${sym}`;
  return `${sym}${amount.toFixed(2)}`;
}

export function fmtAmtRound(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  if (currency === "PLN") return `${Math.round(amount).toLocaleString()}${sym}`;
  return `${sym}${Math.round(amount).toLocaleString()}`;
}

export const CURRENCIES = [
  { code: "USD", label: "US Dollar ($)",       symbol: "$"  },
  { code: "EUR", label: "Euro (€)",            symbol: "€"  },
  { code: "GBP", label: "British Pound (£)",   symbol: "£"  },
  { code: "PLN", label: "Polish Złoty (zł)",   symbol: "zł" },
];

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski"  },
];
