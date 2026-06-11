export type AppPrefs = {
  currency: string;
  language: string;
  totalBudget: number | null;
};

const PREFS_KEY     = "budger_prefs_v1";
const ONBOARDED_KEY = "budger_onboarded_v1";

const DEFAULT_PREFS: AppPrefs = { currency: "USD", language: "en", totalBudget: null };

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

export function currencySymbol(currency: string): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", CHF: "Fr",
    PLN: "zł", JPY: "¥", CAD: "C$", AUD: "A$",
    NOK: "kr", SEK: "kr", DKK: "kr", BRL: "R$",
  };
  return map[currency] ?? currency;
}

export function fmtAmt(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  return `${sym}${amount.toFixed(2)}`;
}

export function fmtAmtRound(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  return `${sym}${Math.round(amount).toLocaleString()}`;
}

export const CURRENCIES = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CHF", label: "Swiss Franc (Fr)" },
  { code: "PLN", label: "Polish Złoty (zł)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "NOK", label: "Norwegian Krone (kr)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "DKK", label: "Danish Krone (kr)" },
  { code: "BRL", label: "Brazilian Real (R$)" },
];

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];
