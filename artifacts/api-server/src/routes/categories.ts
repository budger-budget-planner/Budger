import { Router, type IRouter } from "express";
import { db, categoriesTable, usersTable } from "@workspace/db";
import { eq, or, and, isNull } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
  GetCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  let categories;
  if (user.householdId) {
    categories = await db.select().from(categoriesTable)
      .where(or(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.householdId, user.householdId)
      ))
      .orderBy(categoriesTable.createdAt);
  } else {
    categories = await db.select().from(categoriesTable)
      .where(eq(categoriesTable.userId, userId))
      .orderBy(categoriesTable.createdAt);
  }

  res.json(categories.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/categories", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const [category] = await db.insert(categoriesTable).values({
    ...parsed.data,
    userId,
    householdId: user?.householdId ?? null,
  }).returning();

  res.status(201).json({ ...category, createdAt: category.createdAt.toISOString() });
});

router.get("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ ...category, createdAt: category.createdAt.toISOString() });
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [category] = await db.update(categoriesTable)
    .set(parsed.data)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();

  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ ...category, createdAt: category.createdAt.toISOString() });
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
