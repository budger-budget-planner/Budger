import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Finance Tracker runs in an isolated local PostgreSQL cluster. In that mode,
// never fall back to the workspace's shared DATABASE_URL/NEON_DATABASE_URL.
// This guard is intentionally in the shared DB entry point so every server
// route gets the same isolation guarantee, including session storage.
const financeTrackerMode = process.env.FINANCE_TRACKER_MODE === "1";
const financeTrackerDatabaseUrl = process.env.FINANCE_TRACKER_DATABASE_URL;

if (financeTrackerMode && !financeTrackerDatabaseUrl) {
  throw new Error(
    "FINANCE_TRACKER_DATABASE_URL must be set when FINANCE_TRACKER_MODE=1; refusing to use the shared application database.",
  );
}

// Outside Finance Tracker mode, preserve the existing application behavior:
// NEON_DATABASE_URL takes priority over Replit's managed DATABASE_URL.
export const DATABASE_URL = financeTrackerMode
  ? financeTrackerDatabaseUrl
  : process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL (or NEON_DATABASE_URL) must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,                          // Neon supports up to 10 000 logical connections; 20 gives
                                    // comfortable headroom under rapid-tap bursts without
                                    // exhausting the serverless branch limit
  connectionTimeoutMillis: 5_000,  // fail fast (5 s) on initial TCP/TLS handshake
  idleTimeoutMillis: 30_000,       // recycle idle connections after 30 s
});

// node-postgres emits 'error' on the pool when an *idle* client in the pool
// hits a background error (e.g. the DB briefly drops the connection). If
// nothing listens for it, Node treats it as an unhandled EventEmitter error,
// which can take down whatever request happens to be in flight at that
// moment — surfacing as a random, intermittent 500 unrelated to the request
// itself (e.g. a login attempt with the correct PIN failing "sometimes").
// Just log it and let the pool recycle the connection; do not crash.
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
