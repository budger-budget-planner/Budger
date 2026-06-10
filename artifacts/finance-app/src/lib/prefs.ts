export type AppPrefs = {
  currency: string;
  language: string;
};

const PREFS_KEY      = "budger_prefs_v1";
const ONBOARDED_KEY  = "budger_onboarded_v1";

const DEFAULT_PREFS: AppPrefs = { currency: "USD", language: "en" };

export function loadPrefs(): AppPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") ?? DEFAULT_PREFS;
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
