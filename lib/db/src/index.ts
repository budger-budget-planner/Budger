import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// NEON_DATABASE_URL takes priority when set, so the app can point at an
// externally-hosted Postgres (e.g. Neon) instead of Replit's built-in
// database. DATABASE_URL is managed by the Replit platform itself, so we
// don't overwrite it — we just prefer the external URL when present.
export const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

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
  acquireTimeoutMillis: 8_000,      // surface a clear timeout error instead of hanging forever
                                    // when all 20 connections are busy
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
