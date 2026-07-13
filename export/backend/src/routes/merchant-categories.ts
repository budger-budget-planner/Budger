import { Router, type IRouter } from "express";
import { db, merchantCategoryRulesTable } from "../db";
import { eq, and } from "drizzle-orm";
import { recordMerchantAssignment, enrichRule, normalizeMerchant } from "../lib/merchantRules";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /merchant-categories — list all rules for the current user
router.get("/merchant-categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const rules = await db
    .select()
    .from(merchantCategoryRulesTable)
    .where(eq(merchantCategoryRulesTable.userId, userId));

  const enriched = await Promise.all(rules.map(enrichRule));
  res.json(enriched);
});

// POST /merchant-categories — record a merchant+category assignment
router.post("/merchant-categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { merchantName, categoryId } = req.body;
  if (!merchantName || typeof merchantName !== "string" || typeof categoryId !== "number") {
    res.status(400).json({ error: "merchantName (string) and categoryId (number) are required" });
    return;
  }

  await recordMerchantAssignment(userId, merchantName, categoryId);

  const [rule] = await db
    .select()
    .from(merchantCategoryRulesTable)
    .where(
      and(
        eq(merchantCategoryRulesTable.userId, userId),
        eq(merchantCategoryRulesTable.merchantName, normalizeMerchant(merchantName)),
      ),
    );

  logger.info({ userId, merchantName, categoryId, count: rule?.assignmentCount }, "Merchant assignment recorded");
  res.json(await enrichRule(rule));
});

// PATCH /merchant-categories/:id — update a rule (e.g. disable)
router.patch("/merchant-categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { disabled, autoApply } = req.body as { disabled?: boolean; autoApply?: boolean };
  const patch: Record<string, unknown> = {};
  if (typeof disabled === "boolean") patch.disabled = disabled;
  if (typeof autoApply === "boolean") patch.autoApply = autoApply;

  const [rule] = await db
    .update(merchantCategoryRulesTable)
    .set(patch)
    .where(
      and(
        eq(merchantCategoryRulesTable.id, id),
        eq(merchantCategoryRulesTable.userId, userId),
      ),
    )
    .returning();

  if (!rule) { res.status(404).json({ error: "Not found" }); return; }

  logger.info({ id, patch }, "Merchant rule updated");
  res.json(await enrichRule(rule));
});

export default router;
