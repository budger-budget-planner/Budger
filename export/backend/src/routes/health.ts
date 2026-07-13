import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "../api-zod";
import { pool } from "../db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Verify DB connectivity so this endpoint reflects real service health
// rather than always returning ok even when the database is unreachable.
router.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (err) {
    logger.warn({ err }, "health: DB ping failed");
    res.status(503).json({ status: "error", detail: "Database unreachable" });
  }
});

export default router;
