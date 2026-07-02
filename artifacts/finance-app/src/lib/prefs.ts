export type AppPrefs = {
  currency: string;
  language: string;
  totalBudget: number | null;
  staySignedIn: boolean;
};

const PREFS_KEY_BASE = "budger_prefs_v1";
const ONBOARDED_KEY  = "budger_onboarded_v1";
const SESSION_KEY    = "budger_session";
const ACTIVE_UID_KEY = "budger_active_uid";

const DEFAULT_PREFS: AppPrefs = {
  currency: "USD",
  language: "en",
  totalBudget: null,
  staySignedIn: true,
};

/** Store the current user's id so prefs can be namespaced per account. */
export function setActiveUserId(id: number | null) {
  if (id == null) {
    localStorage.removeItem(ACTIVE_UID_KEY);
  } else {
    localStorage.setItem(ACTIVE_UID_KEY, String(id));
  }
}

export function getActiveUserId(): number | null {
  const raw = localStorage.getItem(ACTIVE_UID_KEY);
  if (!raw) return null;
  const n = parseInt(raw);
  return isNaN(n) ? null : n;
}

function prefsKey(): string {
  const uid = getActiveUserId();
  return uid != null ? `${PREFS_KEY_BASE}_${uid}` : PREFS_KEY_BASE;
}

export function loadPrefs(): AppPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey()) ?? "null") ?? {};
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: AppPrefs) {
  localStorage.setItem(prefsKey(), JSON.stringify(p));
}

/**
 * After login, call this to migrate any pre-login prefs (e.g. language selected
 * on the login screen) into the user-scoped key — but only if the user doesn't
 * already have their own prefs saved (i.e. first login on this device).
 */
export function migratePreLoginPrefs() {
  const uid = getActiveUserId();
  if (uid == null) return;
  const userKey = `${PREFS_KEY_BASE}_${uid}`;
  if (localStorage.getItem(userKey) != null) return; // already has user-scoped prefs, don't overwrite
  const fallback = localStorage.getItem(PREFS_KEY_BASE);
  if (fallback) {
    localStorage.setItem(userKey, fallback);
  }
}

export function isOnboardingDone(): boolean {
  return !!localStorage.getItem(ONBOARDED_KEY);
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

export function clearOnboardingDone() {
  localStorage.removeItem(ONBOARDED_KEY);
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

const PENDING_ONBOARDING_KEY = "budger:pendingOnboarding";

export function setPendingOnboarding() {
  sessionStorage.setItem(PENDING_ONBOARDING_KEY, "1");
}

export function takePendingOnboarding(): boolean {
  const val = sessionStorage.getItem(PENDING_ONBOARDING_KEY);
  if (val) {
    sessionStorage.removeItem(PENDING_ONBOARDING_KEY);
    return true;
  }
  return false;
}

const SWIPE_HINT_KEY_BASE = "budger_swipe_hint_v1";
const SWIPE_HINT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function swipeHintKey(): string {
  const uid = getActiveUserId();
  return uid != null ? `${SWIPE_HINT_KEY_BASE}_${uid}` : SWIPE_HINT_KEY_BASE;
}

/**
 * Decides whether the swipe-to-reveal-actions hint animation should play right now,
 * and records this as the latest "seen" timestamp so it isn't repeated on every visit.
 *
 * Rules:
 *  - First time ever called for this user (e.g. right after onboarding) → show it.
 *  - Otherwise, only show it again if at least a week has passed since it was last shown.
 */
export function checkSwipeHintDue(): boolean {
  const key = swipeHintKey();
  const now = Date.now();
  const raw = localStorage.getItem(key);
  let due: boolean;
  if (raw == null) {
    due = true;
  } else {
    const lastSeen = parseInt(raw, 10);
    due = isNaN(lastSeen) || (now - lastSeen) >= SWIPE_HINT_WEEK_MS;
  }
  localStorage.setItem(key, String(now));
  return due;
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
