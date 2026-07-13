import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { scheduleRateRefreshes } from "@/lib/rates";

// Initialise Sentry before the React tree mounts so it can instrument
// every component. VITE_SENTRY_DSN is intentionally public — Sentry
// client-side DSNs are designed to be embedded in frontend bundles.
// The integration is a no-op when the variable is not set.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    // Capture a replay only on sessions that have an error, never on
    // normal browsing — keeps replay quota low on the free tier.
    integrations: [Sentry.replayIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

document.documentElement.classList.add("dark");

scheduleRateRefreshes();
// When a new service worker takes control (after skipWaiting + clients.claim),
// reload the page so the browser discards old cached JS and loads fresh code.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
