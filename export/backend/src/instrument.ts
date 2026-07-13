/**
 * Sentry instrumentation entry-point.
 *
 * This file is loaded via `node --import ./dist/instrument.mjs` BEFORE any
 * other module so Sentry's OpenTelemetry hooks are in place before Express,
 * pg, etc. are imported — the requirement for full request-tracing support.
 *
 * Keep this file free of any imports from the rest of the codebase.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Sample 10 % of traces in production; every trace in dev.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
  console.info("[sentry] Initialized via --import — Express tracing active");
}
