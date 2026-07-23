const CRASH_REPLAY_CONSENT_KEY = "budger_crash_consent";

export function getCrashReplayConsent(): boolean {
  try {
    return localStorage.getItem(CRASH_REPLAY_CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setCrashReplayConsent(consented: boolean): void {
  try {
    localStorage.setItem(CRASH_REPLAY_CONSENT_KEY, consented ? "true" : "false");
  } catch {
    // If storage is unavailable, the safe default remains opt-out.
  }
}