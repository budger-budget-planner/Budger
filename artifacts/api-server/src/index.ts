// !! Sentry must be imported before everything else so its module-level
// instrumentation hooks are in place before any other code runs.
import "./lib/sentry";

import app from "./app";
import { logger } from "./lib/logger";
import { pool, db } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
/** Minimal duck-typed interface for the pg PoolClient used in baseline logic */
interface DBPoolClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T extends Record<string, any>>(sql: string): Promise<{ rows: T[] }>;
  release(): void;
}

// Fail fast if the database is not configured — every route depends on it
// and starting without one only produces confusing per-request errors later.
if (!process.env.DATABASE_URL) {
  // Use console.error here because the logger may not be initialised yet.
  console.error("[fatal] DATABASE_URL is required but not set — refusing to start.");
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Timestamp of the initial migration (0000_past_blazing_skull).
 * Used when baselining an existing database that was previously managed by
 * drizzle-kit push so we don't try to re-run DDL that already exists.
 */
const INITIAL_MIGRATION_WHEN = 1783712380090n;

/**
 * Minimum number of expected app tables in a fully-initialized schema.
 * Used to distinguish a genuinely populated legacy-push database from a
 * partially-initialized or empty one.
 */
const MIN_EXPECTED_TABLES = 10;

/**
 * PostgreSQL advisory lock key used to serialize the baseline + migrate
 * sequence across concurrent server startups (e.g. rolling deploys, dev
 * hot-reload). The lock is session-scoped and released automatically when
 * the connection is returned to the pool.
 */
const MIGRATION_ADVISORY_LOCK = 987654321;

/**
 * Promote a database that was previously managed by `drizzle-kit push` to
 * migration-based tracking, under a database advisory lock so concurrent
 * startups cannot race through this logic simultaneously.
 *
 * When switching from push → migrate we need to tell Drizzle "the initial
 * migration is already applied" without running its SQL (which would fail on
 * existing tables). We detect this state by checking whether a sufficient
 * number of app tables exist but the drizzle.__drizzle_migrations tracking
 * table does not.
 *
 * On a completely fresh database neither condition holds, so we skip this step
 * and let migrate() create everything from scratch.
 *
 * Safety properties:
 * ─ Advisory lock: only one server instance executes this at a time.
 * ─ Strong schema check: requires MIN_EXPECTED_TABLES app tables, not just one.
 * ─ Idempotent insert: uses WHERE NOT EXISTS so re-entry is a no-op.
 */
async function baselineLegacyPushDatabase(client: DBPoolClient): Promise<void> {
  // Count how many of the expected app tables currently exist.
  const { rows: countRows } = await client.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const tableCount = parseInt(countRows[0]?.cnt ?? "0", 10);

  if (tableCount < MIN_EXPECTED_TABLES) {
    return; // fresh or partial DB — let migrate() handle it from scratch
  }

  // Check whether drizzle migration tracking is already set up.
  const { rows: trackingRows } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    ) AS exists
  `);
  if (trackingRows[0]?.exists === true) {
    return; // already on migrations — nothing to do
  }

  // Legacy push state: create the tracking schema/table and record the initial
  // migration as already applied so migrate() skips its DDL.
  logger.info(
    { tableCount },
    "Detected legacy push database — baselining to migration tracking…",
  );
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id         SERIAL PRIMARY KEY,
      hash       TEXT   NOT NULL,
      created_at BIGINT
    );
    -- Idempotent: only insert if no migration at or after the initial snapshot exists.
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT 'baseline', ${INITIAL_MIGRATION_WHEN}
    WHERE NOT EXISTS (
      SELECT 1 FROM drizzle.__drizzle_migrations
      WHERE created_at >= ${INITIAL_MIGRATION_WHEN}
    );
  `);
  logger.info("Baseline complete — existing schema recorded as migration 0000");
}

/**
 * Apply all pending Drizzle migrations on every startup.
 *
 * ─ Fresh database: migrate() creates all tables from the migration files.
 * ─ Existing database (legacy push): baselineLegacyPushDatabase() marks
 *   the initial migration as already applied, then migrate() picks up newer
 *   migrations.
 * ─ Already migrated: migrate() is a no-op (all migrations already applied).
 *
 * The entire sequence runs under a PostgreSQL advisory lock so concurrent
 * startups (rolling deploys, dev reloads) cannot race through baseline
 * detection or apply the same migration twice.
 *
 * For new schema changes the workflow is:
 *   1. Edit lib/db/src/schema/
 *   2. pnpm --filter @workspace/db run generate   ← creates a new .sql file
 *   3. Commit the migration file
 *   4. The next startup applies it automatically
 */
async function ensureDbSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  logger.info("Running DB migrations…");

  // Migration files are copied to dist/migrations/ by build.mjs so they're
  // available in both dev (source tree) and production builds.
  const migrationsFolder = path.resolve(__dirname, "./migrations");

  // Acquire a session-level advisory lock so that only one process runs
  // the baseline check + migrate() at a time. The lock is released
  // automatically when this dedicated client is returned to the pool.
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK})`);
    await baselineLegacyPushDatabase(client);
    await migrate(db, { migrationsFolder });
    logger.info("DB migrations up to date");
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK})`);
    client.release();
  }
}

// ── Slow query monitoring ──────────────────────────────────────────────────
// Wraps pool.query so any query that takes longer than 200 ms emits a warn
// log. Uses `any` casts because pg's TypeScript overloads don't expose the
// underlying Promise return type, but pool.query is always async in practice.
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _orig = (pool as any).query.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = function (...args: any[]) {
    const t0 = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = _orig(...args) as Promise<any>;
    result.then(() => {
      const ms = Date.now() - t0;
      if (ms > 200) {
        const sql =
          typeof args[0] === "string"
            ? args[0]
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((args[0] as any)?.text ?? "?");
        logger.warn({ ms, sql: sql.slice(0, 150) }, "slow-query: exceeded 200ms threshold");
      }
    }).catch(() => {}); // timing failures must never propagate
    return result;
  };
}

async function start() {
  // ── 1. Ensure schema exists (critical for fresh databases after remix / deploy) ──
  await ensureDbSchema();

  // ── 2. Ensure sessions table exists ──────────────────────────────────────────
  if (process.env.DATABASE_URL) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "sessions" (
          "sid"    varchar      NOT NULL,
          "sess"   json         NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
        );
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
      `);
    } catch (err) {
      logger.warn({ err }, "Could not ensure sessions table — sessions may not persist");
    }
  }

  const server = app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  function gracefulShutdown(signal: string) {
    logger.info({ signal }, "Shutdown signal received — draining connections");
    server.close(async () => {
      try {
        await pool.end();
        logger.info("DB pool closed — exiting cleanly");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error closing DB pool during shutdown");
        process.exit(1);
      }
    });
    // Force-exit if connections don't drain within 10 s.
    setTimeout(() => {
      logger.warn("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

  // Last-resort safety nets: the global Express error handler catches errors
  // from request handlers, but anything thrown outside that flow (a stray
  // async callback, a timer, a background job) would otherwise crash the
  // process silently. Log and keep running rather than take down every user.
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection — continuing");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception — continuing");
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
