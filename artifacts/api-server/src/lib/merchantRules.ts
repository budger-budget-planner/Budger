import { db, merchantCategoryRulesTable, categoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const AUTO_APPLY_THRESHOLD = 3;

/** Normalize merchant name for consistent matching */
export function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Record that the user assigned `categoryId` to `merchantName`.
 * Creates the rule if new, increments count if same pairing, or resets if a different category.
 * Sets autoApply=true once count reaches the threshold.
 */
export async function recordMerchantAssignment(
  userId: number,
  merchantName: string,
  categoryId: number,
): Promise<void> {
  const key = normalizeMerchant(merchantName);

  const [existing] = await db
    .select()
    .from(merchantCategoryRulesTable)
    .where(
      and(
        eq(merchantCategoryRulesTable.userId, userId),
        eq(merchantCategoryRulesTable.merchantName, key),
      ),
    );

  if (!existing) {
    await db.insert(merchantCategoryRulesTable).values({
      userId,
      merchantName: key,
      categoryId,
      assignmentCount: 1,
      autoApply: false,
      disabled: false,
    });
    return;
  }

  if (existing.categoryId !== categoryId) {
    // User switched to a different category — reset the rule
    await db
      .update(merchantCategoryRulesTable)
      .set({ categoryId, assignmentCount: 1, autoApply: false, disabled: false })
      .where(eq(merchantCategoryRulesTable.id, existing.id));
    return;
  }

  // Same category — increment count
  const newCount = existing.assignmentCount + 1;
  const nowAutoApply = newCount >= AUTO_APPLY_THRESHOLD;
  await db
    .update(merchantCategoryRulesTable)
    .set({ assignmentCount: newCount, autoApply: nowAutoApply })
    .where(eq(merchantCategoryRulesTable.id, existing.id));
}

/**
 * Returns the categoryId to auto-apply for a merchant, or null if none.
 * Only returns a result when autoApply=true and disabled=false.
 */
export async function getAutoCategory(
  userId: number,
  merchantName: string,
): Promise<number | null> {
  const key = normalizeMerchant(merchantName);
  const [rule] = await db
    .select()
    .from(merchantCategoryRulesTable)
    .where(
      and(
        eq(merchantCategoryRulesTable.userId, userId),
        eq(merchantCategoryRulesTable.merchantName, key),
        eq(merchantCategoryRulesTable.autoApply, true),
        eq(merchantCategoryRulesTable.disabled, false),
      ),
    );
  return rule?.categoryId ?? null;
}

/** Enrich a rule with category name/color for the API response */
export async function enrichRule(rule: any): Promise<any> {
  const [cat] = rule.categoryId
    ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, rule.categoryId))
    : [];
  return {
    id: rule.id,
    userId: rule.userId,
    merchantName: rule.merchantName,
    categoryId: rule.categoryId,
    categoryName: cat?.name ?? null,
    categoryColor: cat?.color ?? null,
    assignmentCount: rule.assignmentCount,
    autoApply: rule.autoApply,
    disabled: rule.disabled,
    createdAt: rule.createdAt.toISOString(),
  };
}
