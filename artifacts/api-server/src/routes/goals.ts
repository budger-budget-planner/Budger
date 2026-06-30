import { Router, type IRouter } from "express";
import { db, goalsTable, goalContributionsTable, goalProposalsTable, goalEditProposalsTable, usersTable, householdsTable, householdMembersTable, goalActivityTable } from "@workspace/db";
import { eq, or, and, lt, gte, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

function isHead(role: string) { return role === "head" || role === "owner"; }

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatGoal(g: any) {
  return {
    ...g,
    budget: parseFloat(g.budget),
    currency: g.currency ?? null,
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

async function getMemberRole(userId: number, householdId: number): Promise<string> {
  const [m] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  return m?.role ?? "child";
}

async function fanOutActivity(
  householdId: number,
  excludeUserIds: number[],
  type: string,
  goalId: number,
  goalName: string,
  goalColor: string,
  actorName: string | null,
) {
  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
  const targets = members.filter(m => !excludeUserIds.includes(m.userId));
  if (targets.length === 0) return;
  await db.insert(goalActivityTable).values(targets.map(m => ({
    userId: m.userId,
    type,
    goalId,
    goalName,
    goalColor,
    actorName,
  })));
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

// Share proposals — for head members to see pending share proposals
router.get("/goals/proposals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const proposals = await db.select().from(goalProposalsTable)
    .where(and(eq(goalProposalsTable.householdId, user.householdId), eq(goalProposalsTable.status, "pending")));

  if (proposals.length === 0) { res.json([]); return; }

  const goalIds = proposals.map(p => p.goalId);
  const proposerIds = proposals.map(p => p.proposerId);
  const goals = await db.select().from(goalsTable).where(inArray(goalsTable.id, goalIds));
  const proposers = await db.select().from(usersTable).where(inArray(usersTable.id, proposerIds));
  const goalMap = new Map(goals.map(g => [g.id, g]));
  const proposerMap = new Map(proposers.map(u => [u.id, u]));

  res.json(proposals.map(p => {
    const goal = goalMap.get(p.goalId);
    return {
      id: p.id,
      goalId: p.goalId,
      goalName: goal?.name ?? null,
      goalColor: goal?.color ?? null,
      goalBudget: goal?.budget ? parseFloat(goal.budget) : null,
      goalCurrency: goal?.currency ?? null,
      proposerName: proposerMap.get(p.proposerId)?.name ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    };
  }));
});

// Approve a share proposal — head only
router.post("/goals/proposals/:id/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const [proposal] = await db.select().from(goalProposalsTable).where(eq(goalProposalsTable.id, id));
  if (!proposal || proposal.householdId !== user.householdId) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(goalProposalsTable).set({ status: "approved" }).where(eq(goalProposalsTable.id, id));
  await db.update(goalsTable).set({ householdId: user.householdId }).where(eq(goalsTable.id, proposal.goalId));

  // Fan-out goal_changed to all members except head and creator (creator sees it via proposals/mine)
  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, proposal.goalId));
  const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await fanOutActivity(
    user.householdId,
    [userId, proposal.proposerId],
    "goal_changed",
    proposal.goalId,
    goal?.name ?? "",
    goal?.color ?? "#818cf8",
    actor?.name ?? null,
  );

  res.json({ ok: true });
});

// Decline a share proposal — head only
router.post("/goals/proposals/:id/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const [proposal] = await db.select().from(goalProposalsTable).where(eq(goalProposalsTable.id, id));
  if (!proposal || proposal.householdId !== user.householdId) { res.status(404).json({ error: "Not found" }); return; }
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  await db.update(goalProposalsTable).set({ status: "declined", declineReason: reason }).where(eq(goalProposalsTable.id, id));
  res.json({ ok: true });
});

// My own share proposals — any non-head member; returns pending + recently declined/approved
router.get("/goals/proposals/mine", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.json([]); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const proposals = await db.select().from(goalProposalsTable)
    .where(and(
      eq(goalProposalsTable.proposerId, userId),
      sql`(${goalProposalsTable.status} = 'pending' OR ((${goalProposalsTable.status} = 'declined' OR ${goalProposalsTable.status} = 'approved') AND ${goalProposalsTable.createdAt} > ${sevenDaysAgo}))`,
    ));

  if (proposals.length === 0) { res.json([]); return; }

  const goalIds = [...new Set(proposals.map(p => p.goalId))];
  const goals = await db.select().from(goalsTable).where(inArray(goalsTable.id, goalIds));
  const goalMap = new Map(goals.map(g => [g.id, g]));

  res.json(proposals.map(p => {
    const goal = goalMap.get(p.goalId);
    return {
      id: p.id,
      goalId: p.goalId,
      goalName: goal?.name ?? null,
      goalColor: goal?.color ?? null,
      goalBudget: goal?.budget ? parseFloat(goal.budget) : null,
      goalCurrency: goal?.currency ?? null,
      status: p.status,
      declineReason: p.declineReason ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }));
});

// Edit proposals — for head members to see pending edit proposals
router.get("/goals/edit-proposals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const proposals = await db.select().from(goalEditProposalsTable)
    .where(and(eq(goalEditProposalsTable.householdId, user.householdId), eq(goalEditProposalsTable.status, "pending")));

  if (proposals.length === 0) { res.json([]); return; }

  const goalIds = [...new Set(proposals.map(p => p.goalId))];
  const proposerIds = [...new Set(proposals.map(p => p.proposerId))];
  const goals = await db.select().from(goalsTable).where(inArray(goalsTable.id, goalIds));
  const proposers = await db.select().from(usersTable).where(inArray(usersTable.id, proposerIds));
  const goalMap = new Map(goals.map(g => [g.id, g]));
  const proposerMap = new Map(proposers.map(u => [u.id, u]));

  res.json(proposals.map(p => {
    const goal = goalMap.get(p.goalId);
    return {
      id: p.id,
      goalId: p.goalId,
      goalName: goal?.name ?? null,
      goalColor: goal?.color ?? null,
      currentBudget: goal?.budget ? parseFloat(goal.budget) : null,
      currentCurrency: goal?.currency ?? null,
      proposerName: proposerMap.get(p.proposerId)?.name ?? null,
      proposed: {
        name: p.name,
        color: p.color,
        budget: parseFloat(p.budget),
        currency: p.currency ?? null,
        deadline: p.deadline,
        divideByMonths: p.divideByMonths,
      },
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    };
  }));
});

// Approve an edit proposal — head only
router.post("/goals/edit-proposals/:id/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const [proposal] = await db.select().from(goalEditProposalsTable).where(eq(goalEditProposalsTable.id, id));
  if (!proposal || proposal.householdId !== user.householdId) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(goalEditProposalsTable).set({ status: "approved" }).where(eq(goalEditProposalsTable.id, id));
  await db.update(goalsTable).set({
    name: proposal.name,
    color: proposal.color,
    budget: proposal.budget,
    currency: proposal.currency,
    deadline: proposal.deadline,
    divideByMonths: proposal.divideByMonths,
  }).where(eq(goalsTable.id, proposal.goalId));

  // Fan-out goal_changed to all members except head and creator (creator sees it via edit-proposals/mine)
  const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await fanOutActivity(
    user.householdId,
    [userId, proposal.proposerId],
    "goal_changed",
    proposal.goalId,
    proposal.name,
    proposal.color,
    actor?.name ?? null,
  );

  res.json({ ok: true });
});

// Decline an edit proposal — head only
router.post("/goals/edit-proposals/:id/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!isHead(role)) { res.status(403).json({ error: "Not household head" }); return; }

  const [proposal] = await db.select().from(goalEditProposalsTable).where(eq(goalEditProposalsTable.id, id));
  if (!proposal || proposal.householdId !== user.householdId) { res.status(404).json({ error: "Not found" }); return; }

  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  await db.update(goalEditProposalsTable).set({ status: "declined", declineReason: reason }).where(eq(goalEditProposalsTable.id, id));
  res.json({ ok: true });
});

// My own edit proposals — any member; returns pending + recently declined/approved
router.get("/goals/edit-proposals/mine", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.json([]); return; }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const proposals = await db.select().from(goalEditProposalsTable)
    .where(and(
      eq(goalEditProposalsTable.proposerId, userId),
      sql`(${goalEditProposalsTable.status} = 'pending' OR ((${goalEditProposalsTable.status} = 'declined' OR ${goalEditProposalsTable.status} = 'approved') AND ${goalEditProposalsTable.createdAt} > ${sevenDaysAgo}))`,
    ));

  if (proposals.length === 0) { res.json([]); return; }

  const goalIds = [...new Set(proposals.map(p => p.goalId))];
  const goals = await db.select().from(goalsTable).where(inArray(goalsTable.id, goalIds));
  const goalMap = new Map(goals.map(g => [g.id, g]));

  res.json(proposals.map(p => {
    const goal = goalMap.get(p.goalId);
    return {
      id: p.id,
      goalId: p.goalId,
      goalName: goal?.name ?? null,
      goalColor: goal?.color ?? null,
      status: p.status,
      declineReason: p.declineReason ?? null,
      proposed: {
        name: p.name,
        color: p.color,
        budget: parseFloat(p.budget),
        currency: p.currency ?? null,
        deadline: p.deadline,
        divideByMonths: p.divideByMonths,
      },
      createdAt: p.createdAt.toISOString(),
    };
  }));
});

router.post("/goals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const { name, color, budget, currency, deadline, divideByMonths } = req.body;
  if (!name || !color || !budget || !deadline) {
    res.status(400).json({ error: "name, color, budget, deadline required" }); return;
  }
  const [goal] = await db.insert(goalsTable).values({
    name: String(name),
    color: String(color),
    budget: String(parseFloat(budget)),
    currency: currency ? String(currency) : null,
    deadline: String(deadline),
    divideByMonths: Boolean(divideByMonths),
    userId,
    householdId: null,
  }).returning();
  res.status(201).json(formatGoal(goal));
});

// Propose a private goal as a household goal
router.post("/goals/:id/propose", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }
  const [goal] = await db.select().from(goalsTable)
    .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (goal.householdId) { res.status(400).json({ error: "Already a household goal" }); return; }
  const existing = await db.select().from(goalProposalsTable)
    .where(and(eq(goalProposalsTable.goalId, id), eq(goalProposalsTable.status, "pending")));
  if (existing.length > 0) { res.status(409).json({ error: "Proposal already pending" }); return; }
  const [proposal] = await db.insert(goalProposalsTable).values({
    goalId: id,
    proposerId: userId,
    householdId: user.householdId,
    status: "pending",
  }).returning();
  res.status(201).json(proposal);
});

// Propose edits to an existing household goal — creator (non-head) only
router.post("/goals/:id/propose-edit", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = await userScope(userId);
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (!goal.householdId) { res.status(400).json({ error: "Not a household goal" }); return; }
  if (goal.userId !== userId) { res.status(403).json({ error: "Only the goal creator can propose edits" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (isHead(role)) { res.status(400).json({ error: "Head should use PATCH to edit directly" }); return; }

  const { name, color, budget, currency, deadline, divideByMonths } = req.body;
  if (!name || !color || !budget || !deadline) {
    res.status(400).json({ error: "name, color, budget, deadline required" }); return;
  }

  // Cancel any previously pending edit proposals for this goal by this user
  await db.update(goalEditProposalsTable)
    .set({ status: "declined" })
    .where(and(
      eq(goalEditProposalsTable.goalId, id),
      eq(goalEditProposalsTable.proposerId, userId),
      eq(goalEditProposalsTable.status, "pending")
    ));

  const [proposal] = await db.insert(goalEditProposalsTable).values({
    goalId: id,
    proposerId: userId,
    householdId: user.householdId,
    name: String(name),
    color: String(color),
    budget: String(parseFloat(budget)),
    currency: currency ? String(currency) : goal.currency,
    deadline: String(deadline),
    divideByMonths: Boolean(divideByMonths),
    status: "pending",
  }).returning();

  res.status(201).json({ pending: true, proposalId: proposal.id });
});

router.patch("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }

  let editorIsHead = false;

  // Permission check for household goals
  if (goal.householdId) {
    const user = await userScope(userId);
    if (!user?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }
    const role = await getMemberRole(userId, user.householdId);
    if (isHead(role)) {
      editorIsHead = true;
      // Head can edit directly — fall through
    } else if (goal.userId === userId) {
      // Creator (non-head) must use propose-edit endpoint
      res.status(403).json({ error: "Use propose-edit to submit changes for head approval" }); return;
    } else {
      res.status(403).json({ error: "Only the head or goal creator can edit household goals" }); return;
    }
  } else {
    // Private goal: only the creator can edit
    if (goal.userId !== userId) {
      res.status(403).json({ error: "Not your goal" }); return;
    }
  }

  const { name, color, budget, deadline, divideByMonths, householdId } = req.body;
  const update: any = {};
  if (name !== undefined) update.name = String(name);
  if (color !== undefined) update.color = String(color);
  if (budget !== undefined) update.budget = String(parseFloat(budget));
  if (deadline !== undefined) update.deadline = String(deadline);
  if (divideByMonths !== undefined) update.divideByMonths = Boolean(divideByMonths);

  // Setting householdId (making a goal shared) requires head role OR nullifying
  if ("householdId" in req.body) {
    const newHouseholdId = householdId === null ? null : parseInt(householdId);
    if (newHouseholdId !== null) {
      const user = await userScope(userId);
      if (user?.householdId) {
        const role = await getMemberRole(userId, user.householdId);
        if (!isHead(role)) {
          res.status(403).json({ error: "Only head can directly set household goals. Use propose instead." }); return;
        }
      }
    }
    update.householdId = newHouseholdId;
  }

  const [updated] = await db.update(goalsTable).set(update).where(eq(goalsTable.id, id)).returning();

  // If head edited a household goal, fan-out goal_changed to all members except head
  if (editorIsHead && goal.householdId) {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    await fanOutActivity(
      goal.householdId,
      [userId],
      "goal_changed",
      goal.id,
      updated.name,
      updated.color,
      actor?.name ?? null,
    );
  }

  res.json(formatGoal(updated));
});

router.delete("/goals/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }

  // Household goals can only be deleted by head
  if (goal.householdId) {
    const user = await userScope(userId);
    if (user?.householdId) {
      const role = await getMemberRole(userId, user.householdId);
      if (!isHead(role)) {
        res.status(403).json({ error: "Only the head of the household can delete household goals" }); return;
      }
    } else {
      res.status(403).json({ error: "Not in a household" }); return;
    }
  }

  await db.delete(goalContributionsTable).where(eq(goalContributionsTable.goalId, id));
  await db.delete(goalProposalsTable).where(eq(goalProposalsTable.goalId, id));
  await db.delete(goalEditProposalsTable).where(eq(goalEditProposalsTable.goalId, id));
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
  const contribMonth = month ?? currentMonth;

  const user = await userScope(userId);
  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId: parseInt(goalId),
    transactionId: transactionId ? parseInt(transactionId) : null,
    amount: String(parseFloat(amount)),
    month: contribMonth,
    userId,
    householdId: user?.householdId ?? null,
  }).returning();

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, contrib.goalId));
  res.status(201).json(formatContribution(contrib, goal));

  // After response: check completion thresholds and fan-out activity
  if (goal?.householdId) {
    try {
      // Total contributions for this goal across all time
      const allContribs = await db.select().from(goalContributionsTable)
        .where(eq(goalContributionsTable.goalId, goal.id));
      const totalContributed = allContribs.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const goalBudget = parseFloat(goal.budget);

      if (totalContributed >= goalBudget) {
        const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        await fanOutActivity(
          goal.householdId,
          [],
          "goal_completed_total",
          goal.id,
          goal.name,
          goal.color,
          actor?.name ?? null,
        );
      } else if (goal.divideByMonths) {
        // Check monthly threshold
        const monthContribs = allContribs.filter(c => c.month === contribMonth);
        const monthTotal = monthContribs.reduce((sum, c) => sum + parseFloat(c.amount), 0);

        // Calculate monthly target: remaining / months left (at least 1)
        const deadlineDate = new Date(goal.deadline);
        const monthsLeft = Math.max(
          1,
          (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
          (deadlineDate.getMonth() - now.getMonth()) + 1
        );
        const remaining = Math.max(0, goalBudget - (totalContributed - parseFloat(contrib.amount)));
        const monthlyTarget = remaining / monthsLeft;

        if (monthlyTarget > 0 && monthTotal >= monthlyTarget) {
          const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          await fanOutActivity(
            goal.householdId,
            [],
            "goal_completed_monthly",
            goal.id,
            goal.name,
            goal.color,
            actor?.name ?? null,
          );
        }
      }
    } catch {
      // Non-critical: don't fail the request if activity generation fails
    }
  }
});

router.delete("/goal-contributions/:id", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(goalContributionsTable).where(eq(goalContributionsTable.id, id));
  res.sendStatus(204);
});

// Goal activity feed — returns undismissed activity for current user
router.get("/goals/activity", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activity = await db.select().from(goalActivityTable)
    .where(and(
      eq(goalActivityTable.userId, userId),
      eq(goalActivityTable.dismissed, false),
      sql`${goalActivityTable.createdAt} > ${thirtyDaysAgo}`,
    ))
    .orderBy(sql`${goalActivityTable.createdAt} DESC`);

  res.json(activity.map(a => ({
    id: a.id,
    type: a.type,
    goalId: a.goalId,
    goalName: a.goalName,
    goalColor: a.goalColor,
    actorName: a.actorName,
    createdAt: a.createdAt.toISOString(),
  })));
});

// Dismiss a goal activity item
router.post("/goals/activity/:id/dismiss", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(goalActivityTable)
    .set({ dismissed: true })
    .where(and(eq(goalActivityTable.id, id), eq(goalActivityTable.userId, userId)));

  res.json({ ok: true });
});

// Dismiss all goal activity items for current user
router.post("/goals/activity/dismiss-all", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  await db.update(goalActivityTable)
    .set({ dismissed: true })
    .where(and(eq(goalActivityTable.userId, userId), eq(goalActivityTable.dismissed, false)));

  res.json({ ok: true });
});

export default router;
