import { Router, type IRouter } from "express";
import { db, goalsTable, goalContributionsTable, goalProposalsTable, goalEditProposalsTable, usersTable, householdsTable, householdMembersTable, goalActivityTable } from "@workspace/db";
import { eq, or, and, lt, gte, inArray, sql, isNull, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

function isHead(role: string) { return role === "head" || role === "owner"; }

function today() {
  return new Date().toISOString().slice(0, 10);
}

// A realized (fully-funded) goal stays visible as active for 24h after
// realization, then automatically moves to Past Goals.
const notYetMovedToPast = or(
  isNull(goalsTable.realizedAt),
  sql`${goalsTable.realizedAt} > now() - interval '24 hours'`,
);
const realizedPastCutoff = and(
  isNotNull(goalsTable.realizedAt),
  sql`${goalsTable.realizedAt} <= now() - interval '24 hours'`,
);

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
    goalCurrency: goal?.currency ?? null,
    transactionId: c.transactionId ?? null,
    amount: parseFloat(c.amount),
    currency: c.currency ?? null,
    accountAmount: c.accountAmount != null ? parseFloat(c.accountAmount) : null,
    accountCurrency: c.accountCurrency ?? null,
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
  activityMonth?: string,
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
    activityMonth: activityMonth ?? null,
  }))).onConflictDoNothing();
}

async function fanOutActivityToUser(
  targetUserId: number,
  type: string,
  goalId: number,
  goalName: string,
  goalColor: string,
  actorName: string | null,
) {
  await db.insert(goalActivityTable).values({
    userId: targetUserId,
    type,
    goalId,
    goalName,
    goalColor,
    actorName,
  });
}

function isChildRole(role: string) { return role === "child" || role === "member"; }

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
          gte(goalsTable.deadline, t),
          notYetMovedToPast,
        ))
        .orderBy(goalsTable.deadline)
    : await db.select().from(goalsTable)
        .where(and(eq(goalsTable.userId, userId), gte(goalsTable.deadline, t), notYetMovedToPast))
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
          or(lt(goalsTable.deadline, t), realizedPastCutoff),
        ))
        .orderBy(goalsTable.deadline)
    : await db.select().from(goalsTable)
        .where(and(eq(goalsTable.userId, userId), or(lt(goalsTable.deadline, t), realizedPastCutoff)))
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

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, proposal.goalId));
  const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const gName = goal?.name ?? "";
  const gColor = goal?.color ?? "#818cf8";
  const aName = actor?.name ?? null;

  // Notify proposer their goal was approved
  await fanOutActivityToUser(proposal.proposerId, "share_approved", proposal.goalId, gName, gColor, aName);

  // Notify all ward/child members that a new household goal was created
  const allMembers = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, user.householdId));
  const wardTargets = allMembers.filter(m => isChildRole(m.role) && m.userId !== proposal.proposerId);
  if (wardTargets.length > 0) {
    await db.insert(goalActivityTable).values(wardTargets.map(m => ({
      userId: m.userId,
      type: "goal_created",
      goalId: proposal.goalId,
      goalName: gName,
      goalColor: gColor,
      actorName: aName,
    })));
  }

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

  // Notify proposer their goal was declined
  const [declineGoal] = await db.select().from(goalsTable).where(eq(goalsTable.id, proposal.goalId));
  const [declineActor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await fanOutActivityToUser(
    proposal.proposerId,
    "share_declined",
    proposal.goalId,
    declineGoal?.name ?? "",
    declineGoal?.color ?? "#818cf8",
    declineActor?.name ?? null,
  );

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
      currentDeadline: goal?.deadline ?? null,
      currentDivideByMonths: goal?.divideByMonths ?? false,
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

  // Notify proposer their edit was approved
  const [editActor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await fanOutActivityToUser(
    proposal.proposerId,
    "edit_approved",
    proposal.goalId,
    proposal.name,
    proposal.color,
    editActor?.name ?? null,
  );
  // Fan-out goal_changed to all other members (not head, not proposer)
  await fanOutActivity(
    user.householdId,
    [userId, proposal.proposerId],
    "goal_changed",
    proposal.goalId,
    proposal.name,
    proposal.color,
    editActor?.name ?? null,
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

  // Notify proposer their edit was declined
  const [editDeclineActor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await fanOutActivityToUser(
    proposal.proposerId,
    "edit_declined",
    proposal.goalId,
    proposal.name,
    proposal.color,
    editDeclineActor?.name ?? null,
  );

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
  if (!name || !color || !budget || (deadline !== "TBD" && !deadline)) {
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

  // If a transactionId is supplied, return all contributions for that transaction
  // across ALL months — no month filter needed.
  const transactionIdFilter = typeof req.query.transactionId === "string"
    ? parseInt(req.query.transactionId) : null;

  if (transactionIdFilter && !isNaN(transactionIdFilter)) {
    const contribs = await db.select().from(goalContributionsTable)
      .where(and(
        eq(goalContributionsTable.userId, userId),
        eq(goalContributionsTable.transactionId, transactionIdFilter),
      ));
    const goals = await db.select().from(goalsTable);
    const goalMap = new Map(goals.map(g => [g.id, g]));
    res.json(contribs.map(c => formatContribution(c, goalMap.get(c.goalId))));
    return;
  }

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
  const { goalId, transactionId, amount, month, currency, accountAmount, accountCurrency } = req.body;
  if (!goalId || !amount) { res.status(400).json({ error: "goalId and amount required" }); return; }
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const contribMonth = month ?? currentMonth;

  const user = await userScope(userId);

  // Authorization: caller must own the goal (personal) or belong to its household
  const [targetGoal] = await db.select().from(goalsTable).where(eq(goalsTable.id, parseInt(goalId)));
  if (!targetGoal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (targetGoal.householdId) {
    if (!user?.householdId || user.householdId !== targetGoal.householdId) {
      res.status(403).json({ error: "Not a member of this goal's household" }); return;
    }
  } else {
    if (targetGoal.userId !== userId) {
      res.status(403).json({ error: "Not authorized to contribute to this goal" }); return;
    }
  }

  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId: parseInt(goalId),
    transactionId: transactionId ? parseInt(transactionId) : null,
    amount: String(parseFloat(amount)),
    currency: currency ?? null,
    accountAmount: accountAmount != null ? String(parseFloat(accountAmount)) : null,
    accountCurrency: accountCurrency ?? null,
    month: contribMonth,
    userId,
    householdId: user?.householdId ?? null,
  }).returning();

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, contrib.goalId));
  res.status(201).json(formatContribution(contrib, goal));

  // After response: check completion thresholds and create activity notifications
  if (goal) {
    try {
      // Total contributions for this goal across all time
      const allContribs = await db.select().from(goalContributionsTable)
        .where(eq(goalContributionsTable.goalId, goal.id));
      const totalContributed = allContribs.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const goalBudget = parseFloat(goal.budget);

      if (totalContributed >= goalBudget) {
        // Idempotency: only emit once per goal (any prior completion row blocks re-emit)
        const [existingTotal] = await db.select({ id: goalActivityTable.id })
          .from(goalActivityTable)
          .where(and(
            eq(goalActivityTable.goalId, goal.id),
            eq(goalActivityTable.type, "goal_completed_total"),
          ))
          .limit(1);

        if (!existingTotal) {
          const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (goal.householdId) {
            // Household goal: fan out to all members
            await fanOutActivity(
              goal.householdId,
              [],
              "goal_completed_total",
              goal.id,
              goal.name,
              goal.color,
              actor?.name ?? null,
            );
          } else {
            // Personal goal: notify the goal owner (may differ from the contributing actor)
            const recipientId = goal.userId ?? userId;
            await db.insert(goalActivityTable).values({
              userId: recipientId,
              type: "goal_completed_total",
              goalId: goal.id,
              goalName: goal.name,
              goalColor: goal.color,
              actorName: actor?.name ?? null,
            }).onConflictDoNothing();
          }
        }

        // Mark the goal as realized (once) and notify that it will move to
        // Past Goals within 24 hours.
        if (!goal.realizedAt) {
          await db.update(goalsTable).set({ realizedAt: new Date() }).where(eq(goalsTable.id, goal.id));
          const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (goal.householdId) {
            await fanOutActivity(
              goal.householdId,
              [],
              "goal_realized",
              goal.id,
              goal.name,
              goal.color,
              actor?.name ?? null,
            );
          } else {
            const recipientId = goal.userId ?? userId;
            await db.insert(goalActivityTable).values({
              userId: recipientId,
              type: "goal_realized",
              goalId: goal.id,
              goalName: goal.name,
              goalColor: goal.color,
              actorName: actor?.name ?? null,
            }).onConflictDoNothing();
          }
        }
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
          // Idempotency: only emit once per goal per contribution month.
          // Use activityMonth (YYYY-MM string) — not createdAt — so backdated
          // contributions correctly dedupe against previously emitted events.
          const [existingMonthly] = await db.select({ id: goalActivityTable.id })
            .from(goalActivityTable)
            .where(and(
              eq(goalActivityTable.goalId, goal.id),
              eq(goalActivityTable.type, "goal_completed_monthly"),
              eq(goalActivityTable.activityMonth, contribMonth),
            ))
            .limit(1);

          if (!existingMonthly) {
            const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
            if (goal.householdId) {
              // Household goal: fan out to all members
              await fanOutActivity(
                goal.householdId,
                [],
                "goal_completed_monthly",
                goal.id,
                goal.name,
                goal.color,
                actor?.name ?? null,
                contribMonth,
              );
            } else {
              // Personal goal: notify the goal owner (may differ from the contributing actor)
              const recipientId = goal.userId ?? userId;
              await db.insert(goalActivityTable).values({
                userId: recipientId,
                type: "goal_completed_monthly",
                goalId: goal.id,
                goalName: goal.name,
                goalColor: goal.color,
                actorName: actor?.name ?? null,
                activityMonth: contribMonth,
              }).onConflictDoNothing();
            }
          }
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

  // Fetch the contribution before deletion so we can check threshold rollback
  const [contrib] = await db.select().from(goalContributionsTable).where(eq(goalContributionsTable.id, id));
  await db.delete(goalContributionsTable).where(eq(goalContributionsTable.id, id));
  res.sendStatus(204);

  // After response: if deletion causes goal to drop below a completion threshold,
  // delete the completion activity rows so the idempotency gate resets and a future
  // re-completion will fire a fresh notification.
  if (!contrib) return;
  try {
    const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, contrib.goalId));
    if (!goal) return;

    const remaining = await db.select().from(goalContributionsTable)
      .where(eq(goalContributionsTable.goalId, goal.id));
    const totalNow = remaining.reduce((s, c) => s + parseFloat(c.amount), 0);
    const budget = parseFloat(goal.budget);

    // If goal is no longer fully funded, clear total-completion rows so re-completion re-notifies
    if (totalNow < budget) {
      await db.delete(goalActivityTable).where(and(
        eq(goalActivityTable.goalId, goal.id),
        eq(goalActivityTable.type, "goal_completed_total"),
      ));
      // If goal was realized (fully funded), revert it back to active — no notification
      if (goal.realizedAt) {
        await db.update(goalsTable).set({ realizedAt: null }).where(eq(goalsTable.id, goal.id));
        await db.delete(goalActivityTable).where(and(
          eq(goalActivityTable.goalId, goal.id),
          eq(goalActivityTable.type, "goal_realized"),
        ));
      }
    }

    // If the deleted contribution's month no longer meets the monthly target, clear that month's rows
    if (goal.divideByMonths && contrib.month) {
      const monthContribs = remaining.filter(c => c.month === contrib.month);
      const monthTotal = monthContribs.reduce((s, c) => s + parseFloat(c.amount), 0);
      const now = new Date();
      const deadlineDate = new Date(goal.deadline);
      const monthsLeft = Math.max(
        1,
        (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
        (deadlineDate.getMonth() - now.getMonth()) + 1
      );
      const preDeletionTotal = totalNow + parseFloat(contrib.amount);
      const remainingBudget = Math.max(0, budget - (preDeletionTotal - parseFloat(contrib.amount)));
      const monthlyTarget = remainingBudget / monthsLeft;

      if (monthlyTarget > 0 && monthTotal < monthlyTarget) {
        await db.delete(goalActivityTable).where(and(
          eq(goalActivityTable.goalId, goal.id),
          eq(goalActivityTable.type, "goal_completed_monthly"),
          eq(goalActivityTable.activityMonth, contrib.month),
        ));
      }
    }
  } catch { /* non-critical */ }
});

// Per-goal member breakdown — all members' contributions for a specific household goal
router.get("/goals/:id/member-breakdown", async (req, res): Promise<void> => {
  const callerId = (req.session as any)?.userId;
  if (!callerId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const goalId = parseInt(req.params.id);
  if (isNaN(goalId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = await userScope(callerId);
  if (!caller?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const [goal] = await db.select().from(goalsTable)
    .where(eq(goalsTable.id, goalId));
  if (!goal || goal.householdId !== caller.householdId) {
    res.status(404).json({ error: "Not found or not a household goal" }); return;
  }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, caller.householdId));
  if (!members.length) { res.json([]); return; }

  const memberIds = members.map(m => m.userId);
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, memberIds));
  const userMap = new Map(users.map(u => [u.id, u]));

  const contribs = await db.select().from(goalContributionsTable)
    .where(and(eq(goalContributionsTable.goalId, goalId), inArray(goalContributionsTable.userId, memberIds)));

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = members.map(m => {
    const mc = contribs.filter(c => c.userId === m.userId);
    const allTime = mc.reduce((s, c) => s + parseFloat(c.amount), 0);
    const thisMonth = mc.filter(c => c.month === currentMonth).reduce((s, c) => s + parseFloat(c.amount), 0);
    return {
      userId: m.userId,
      name: userMap.get(m.userId)?.name ?? "",
      memberColor: m.memberColor,
      allTimeAmount: Math.round(allTime * 100) / 100,
      currentMonthAmount: Math.round(thisMonth * 100) / 100,
      goalCurrency: goal.currency ?? null,
    };
  }).filter(m => m.allTimeAmount > 0 || m.currentMonthAmount > 0);

  res.json(result);
});

// Member goal contributions — contribution totals per household goal for a specific member
router.get("/goals/member-contributions/:userId", async (req, res): Promise<void> => {
  const callerId = (req.session as any)?.userId;
  if (!callerId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  // Verify both caller and target are in the same household
  const caller = await userScope(callerId);
  if (!caller?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const [targetMember] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, caller.householdId)));
  if (!targetMember) { res.status(403).json({ error: "Target not in same household" }); return; }

  // Get all household goals
  const householdGoals = await db.select().from(goalsTable)
    .where(eq(goalsTable.householdId, caller.householdId));
  if (!householdGoals.length) { res.json([]); return; }

  const goalIds = householdGoals.map(g => g.id);

  // Get ALL contributions from the target member for these goals
  const allContribs = await db.select().from(goalContributionsTable)
    .where(and(
      eq(goalContributionsTable.userId, targetUserId),
      inArray(goalContributionsTable.goalId, goalIds),
    ));

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const result = householdGoals.map(g => {
    const goalContribs = allContribs.filter(c => c.goalId === g.id);
    const allTimeAmount = goalContribs.reduce((s, c) => s + parseFloat(c.amount), 0);
    const currentMonthAmount = goalContribs
      .filter(c => c.month === currentMonth)
      .reduce((s, c) => s + parseFloat(c.amount), 0);

    const budget = parseFloat(g.budget);

    let monthlyTarget: number | null = null;
    let percentage = 0;
    let displayAmount = 0;

    if (g.divideByMonths) {
      const deadlineDate = new Date(g.deadline);
      const monthsLeft = Math.max(
        1,
        (deadlineDate.getFullYear() - now.getFullYear()) * 12
          + (deadlineDate.getMonth() - now.getMonth()) + 1
      );
      monthlyTarget = Math.round((budget / monthsLeft) * 100) / 100;
      displayAmount = currentMonthAmount;
      percentage = monthlyTarget > 0 ? Math.round((currentMonthAmount / monthlyTarget) * 10000) / 100 : 0;
    } else {
      displayAmount = allTimeAmount;
      percentage = budget > 0 ? Math.round((allTimeAmount / budget) * 10000) / 100 : 0;
    }

    return {
      goalId: g.id,
      goalName: g.name,
      goalColor: g.color,
      goalCurrency: g.currency ?? null,
      budget,
      divideByMonths: !!g.divideByMonths,
      monthlyTarget,
      allTimeAmount: Math.round(allTimeAmount * 100) / 100,
      currentMonthAmount: Math.round(currentMonthAmount * 100) / 100,
      displayAmount: Math.round(displayAmount * 100) / 100,
      percentage: Math.min(percentage, 100),
    };
  }).filter(g => g.allTimeAmount > 0); // only goals with any contribution

  res.json(result);
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
