import { Router, type IRouter } from "express";
import { db, goalsTable, goalContributionsTable, usersTable } from "@workspace/db";
import { eq, or, and, lt, gte } from "drizzle-orm";

const router: IRouter = Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatGoal(g: any) {
  return {
    ...g,
    budget: parseFloat(g.budget),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt?.toISOString?.() ?? g.createdAt.toISOString(),
  };
}

function formatContribution(c: any, goal?: any) {
  return {
    id: c.id,
    goalId: c.goalId,
    goalName: goal?.name ?? null,
    goalColor: goal?.color ?? null,
    transactionId: c.transactionId ?? null,
    amount: parseFloat(c.amount),
    month: c.month,
    userId: c.userId,
    householdId: c.householdId ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

async function userScope(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

router.get("/goals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const t = today();
  const goals = user.householdId
    ? await db.select().from(goalsTable)
        .where(and(
          or(eq(goalsTable.userId, userId), eq(goalsTable.householdId, user.householdId)),
          gte(goalsTable.deadline, t)
        ))
        .orderBy(goalsTable.deadline)
    : await db.select().from(goalsTable)
        .where(and(eq(goalsTable.userId, userId), gte(goalsTable.deadline, t)))
        .orderBy(goalsTable.deadline);

  res.json(goals.map(formatGoal));
});

router.get("/goals/past", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const t = today();
  const goals = user.householdId
    ? await db.select().from(goalsTable)
        .where(and(
          or(eq(goalsTable.userId, userId), eq(goalsTable.householdId, user.householdId)),
          lt(goalsTable.deadline, t)
        ))
        .orderBy(goalsTable.deadline)
    : await db.select().from(goalsTable)
        .where(and(eq(goalsTable.userId, userId), lt(goalsTable.deadline, t)))
        .orderBy(goalsTable.deadline);

  res.json(goals.map(formatGoal));
});

router.post("/goals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const { name, color, budget, deadline, divideByMonths } = req.body;
  if (!name || !color || !budget || !deadline) {
    res.status(400).json({ error: "name, color, budget, deadline required" }); return;
  }
  const user = await userScope(userId);
  const [goal] = await db.insert(goalsTable).values({
    name: String(name),
    color: String(color),
    budget: String(parseFloat(budget)),
    deadline: String(deadline),
    divideByMonths: Boolean(divideByMonths),
    userId,
    householdId: null,
  }).returning();
  res.status(201).json(formatGoal(goal));
});

router.patch("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, color, budget, deadline, divideByMonths } = req.body;
  const update: any = {};
  if (name !== undefined) update.name = String(name);
  if (color !== undefined) update.color = String(color);
  if (budget !== undefined) update.budget = String(parseFloat(budget));
  if (deadline !== undefined) update.deadline = String(deadline);
  if (divideByMonths !== undefined) update.divideByMonths = Boolean(divideByMonths);
  const [goal] = await db.update(goalsTable).set(update).where(eq(goalsTable.id, id)).returning();
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatGoal(goal));
});

router.delete("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(goalContributionsTable).where(eq(goalContributionsTable.goalId, id));
  await db.delete(goalsTable).where(eq(goalsTable.id, id));
  res.sendStatus(204);
});

router.get("/goal-contributions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = typeof req.query.month === "string" ? req.query.month : currentMonth;
  const goalIdFilter = typeof req.query.goalId === "string" ? parseInt(req.query.goalId) : null;

  let contribs;
  if (goalIdFilter) {
    contribs = await db.select().from(goalContributionsTable)
      .where(and(eq(goalContributionsTable.userId, userId), eq(goalContributionsTable.month, month), eq(goalContributionsTable.goalId, goalIdFilter)));
  } else {
    contribs = await db.select().from(goalContributionsTable)
      .where(and(eq(goalContributionsTable.userId, userId), eq(goalContributionsTable.month, month)));
  }

  const goals = await db.select().from(goalsTable);
  const goalMap = new Map(goals.map(g => [g.id, g]));
  res.json(contribs.map(c => formatContribution(c, goalMap.get(c.goalId))));
});

router.post("/goal-contributions", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const { goalId, transactionId, amount, month } = req.body;
  if (!goalId || !amount) { res.status(400).json({ error: "goalId and amount required" }); return; }
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const user = await userScope(userId);
  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId: parseInt(goalId),
    transactionId: transactionId ? parseInt(transactionId) : null,
    amount: String(parseFloat(amount)),
    month: month ?? currentMonth,
    userId,
    householdId: user?.householdId ?? null,
  }).returning();
  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, contrib.goalId));
  res.status(201).json(formatContribution(contrib, goal));
});

router.delete("/goal-contributions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(goalContributionsTable).where(eq(goalContributionsTable.id, id));
  res.sendStatus(204);
});

export default router;
