import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { spawnSync } from "child_process";
import path from "path";

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
 * Automatically push the Drizzle schema to the database on every startup.
 *
 * This is idempotent — on an existing database drizzle-kit detects no changes
 * and exits immediately. On a fresh database (e.g. after a Replit remix or a
 * new deployment) it creates all tables so the app is immediately usable
 * without any manual `pnpm --filter @workspace/db run push` step.
 *
 * Uses `push-force` (drizzle-kit push --force) to skip interactive prompts.
 */
async function ensureDbSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  logger.info("Applying DB schema (drizzle-kit push --force)…");

  // Find the workspace root: walk up from __dirname until we find pnpm-workspace.yaml.
  // After esbuild, __dirname is the dist/ dir inside the artifact; we need the repo root.
  let workspaceRoot = path.resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    const parent = path.dirname(workspaceRoot);
    if (parent === workspaceRoot) break; // filesystem root — stop
    workspaceRoot = parent;
    try {
      const fs = await import("fs");
      if (fs.existsSync(path.join(workspaceRoot, "pnpm-workspace.yaml"))) break;
    } catch { /* ignore */ }
  }

  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/db", "run", "push-force"],
    {
      cwd: workspaceRoot,
      stdio: "pipe",
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    logger.warn(
      { stdout: result.stdout, stderr: result.stderr, status: result.status },
      "DB schema push exited with non-zero status — continuing startup anyway",
    );
  } else {
    logger.info("DB schema is up to date");
  }
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
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
