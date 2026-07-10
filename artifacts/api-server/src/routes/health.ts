import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Verify DB connectivity so this endpoint reflects real service health
// rather than always returning ok even when the database is unreachable.
router.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "health: DB ping failed");
    res.status(503).json({ status: "error", detail: "Database unreachable" });
  }
});

export default router;
