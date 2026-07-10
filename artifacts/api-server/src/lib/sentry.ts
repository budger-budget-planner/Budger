import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Sample 10 % of traces in production to stay comfortably within the
    // free tier; capture every trace in development for easier debugging.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
  // Logger is not yet available at module-load time — use console so the
  // message still appears in the workflow stdout with the correct level.
  console.info("[sentry] Initialized — errors and traces will be reported");
} else {
  console.warn(
    "[sentry] SENTRY_DSN is not set — error tracking is disabled. " +
    "Set SENTRY_DSN in environment secrets to enable Sentry.",
  );
}

// Re-export so callers (app.ts, index.ts) don't need to re-import @sentry/node.
export { Sentry };
