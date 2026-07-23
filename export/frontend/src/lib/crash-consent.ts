import { getActiveUserId } from "./prefs";

const CRASH_REPLAY_CONSENT_KEY_BASE = "budger_crash_consent";

function crashReplayConsentKey(): string | null {
  const userId = getActiveUserId();
  return userId == null ? null : `${CRASH_REPLAY_CONSENT_KEY_BASE}_${userId}`;
}

export function getCrashReplayConsent(): boolean {
  try {
    const key = crashReplayConsentKey();
    return key != null && localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function setCrashReplayConsent(consented: boolean): void {
  try {
    const key = crashReplayConsentKey();
    if (key == null) return;
    localStorage.setItem(key, consented ? "true" : "false");
  } catch {
    // If storage is unavailable, the safe default remains opt-out.
  }
}