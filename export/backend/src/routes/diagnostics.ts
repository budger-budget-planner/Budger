import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { getNeonUsageSnapshot } from "../lib/neon-usage-metrics";

const router: IRouter = Router();

function hasDiagnosticsAccess(requestToken: string | undefined): boolean {
  const expected = process.env.DIAGNOSTICS_TOKEN;
  if (!expected || !requestToken) return false;
  const actualBuffer = Buffer.from(requestToken);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

router.get("/diagnostics/neon-usage", (req, res): void => {
  if (!hasDiagnosticsAccess(req.header("x-diagnostics-token"))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(getNeonUsageSnapshot());
});

export default router;