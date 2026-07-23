import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { scheduleRateRefreshes } from "@/lib/rates";
import { applyIconPrefToDocument } from "@/lib/prefs";
import { getCrashReplayConsent } from "@/lib/crash-consent";

// Initialise Sentry before the React tree mounts so it can instrument
// every component. VITE_SENTRY_DSN is intentionally public — Sentry
// client-side DSNs are designed to be embedded in frontend bundles.
// The integration is a no-op when the variable is not set.
//
// Apple App Store / GDPR compliance: screen-level session replay is
// opt-in only. Budger records sensitive financial data on screen, so
// replay is disabled until the user explicitly enables "Send crash
// reports" in Settings → Privacy. The consent flag is stored in
// localStorage under "budger_crash_consent".
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  const crashReplayConsented = getCrashReplayConsent();
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Only load the replay integration when the user has opted in —
    // avoids capturing financial screen content without consent.
    integrations: crashReplayConsented ? [Sentry.replayIntegration()] : [],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: crashReplayConsented ? 1.0 : 0,
  });
}

document.documentElement.classList.add("dark");

// Apply the user's saved icon preference to the apple-touch-icon link so the
// next "Add to Home Screen" action picks up the correct image. Runs before
// React mounts so the DOM is ready for Safari to read at install time.
applyIconPrefToDocument();

scheduleRateRefreshes();
// When a new service worker takes control (after skipWaiting + clients.claim),
// reload the page so the browser discards old cached JS and loads fresh code.
//
// Guard: skip the reload if the page is younger than SPLASH_GUARD_MS.
// On a cold PWA open the SW often updates within the first second — without
// this guard the reload interrupts the splash animation and plays it twice.
// The new SW already controls the page via clients.claim(), so no reload is
// needed to get fresh assets on a fresh page load. For long-lived background
// tabs (open > SPLASH_GUARD_MS) the reload still fires as intended.
const _swPageLoadTime = Date.now();
const SPLASH_GUARD_MS = 10_000;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (Date.now() - _swPageLoadTime < SPLASH_GUARD_MS) return;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
