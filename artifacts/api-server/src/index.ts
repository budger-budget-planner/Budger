import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

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

async function start() {
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

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
