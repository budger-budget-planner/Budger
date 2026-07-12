/**
 * Sentry re-export shim.
 *
 * Actual initialisation happens in instrument.ts, loaded via
 * `node --import ./dist/instrument.mjs` before any other module runs.
 * This file just re-exports the already-initialised Sentry object so
 * callers (app.ts, routes) can call setupExpressErrorHandler etc. without
 * importing @sentry/node directly.
 */
import * as Sentry from "@sentry/node";
export { Sentry };
