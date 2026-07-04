import { Router, type IRouter } from "express";
import {
  db,
  categoriesTable,
  usersTable,
  householdMembersTable,
  categoryShareProposalsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function isHead(role: string) { return role === "head" || role === "owner"; }
function isParent(role: string) { return role === "parent"; }
function canPropose(role: string) { return isHead(role) || isParent(role); }

async function getMemberRole(userId: number, householdId: number): Promise<string> {
  const [m] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  return m?.role ?? "child";
}

function formatProposal(p: any, proposerName: string | null) {
  return {
    id: p.id,
    proposedByUserId: p.proposedByUserId,
    proposerName,
    name: p.name,
    color: p.color,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

// Propose sharing a category with one member, or all household members.
router.post("/categories/:id/share", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const role = await getMemberRole(userId, user.householdId);
  if (!canPropose(role)) { res.status(403).json({ error: "Only heads and parents can share categories" }); return; }

  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!category || category.userId !== userId) { res.status(404).json({ error: "Category not found" }); return; }

  const { targetUserId, all } = req.body ?? {};

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, user.householdId));

  let targetIds: number[] = [];
  if (all === true) {
    targetIds = members.filter(m => m.userId !== userId).map(m => m.userId);
  } else {
    const parsedTarget = parseInt(targetUserId);
    if (isNaN(parsedTarget)) { res.status(400).json({ error: "targetUserId or all required" }); return; }
    const isMember = members.some(m => m.userId === parsedTarget);
    if (!isMember || parsedTarget === userId) { res.status(400).json({ error: "Invalid target member" }); return; }
    targetIds = [parsedTarget];
  }

  if (targetIds.length === 0) { res.status(400).json({ error: "No eligible targets" }); return; }

  const proposals = await db.insert(categoryShareProposalsTable).values(
    targetIds.map(targetUserId => ({
      householdId: user.householdId as number,
      proposedByUserId: userId,
      targetUserId,
      sourceCategoryId: category.id,
      name: category.name,
      color: category.color,
      status: "pending",
    }))
  ).returning();

  res.status(201).json(proposals);
});

// Pending share proposals for the current user (as recipient).
router.get("/category-share-proposals", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const proposals = await db.select().from(categoryShareProposalsTable)
    .where(and(eq(categoryShareProposalsTable.targetUserId, userId), eq(categoryShareProposalsTable.status, "pending")))
    .orderBy(categoryShareProposalsTable.createdAt);

  if (proposals.length === 0) { res.json([]); return; }

  const proposerIds = [...new Set(proposals.map(p => p.proposedByUserId))];
  const proposers = await db.select().from(usersTable);
  const proposerMap = new Map(proposers.filter(u => proposerIds.includes(u.id)).map(u => [u.id, u.name]));

  res.json(proposals.map(p => formatProposal(p, proposerMap.get(p.proposedByUserId) ?? null)));
});

router.post("/category-share-proposals/:id/accept", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [proposal] = await db.select().from(categoryShareProposalsTable).where(eq(categoryShareProposalsTable.id, id));
  if (!proposal || proposal.targetUserId !== userId) { res.status(404).json({ error: "Proposal not found" }); return; }
  if (proposal.status !== "pending") { res.status(409).json({ error: "Proposal already resolved" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const [category] = await db.insert(categoriesTable).values({
    name: proposal.name,
    color: proposal.color,
    icon: "tag",
    budget: null,
    userId,
    householdId: user?.householdId ?? null,
  }).returning();

  await db.update(categoryShareProposalsTable).set({ status: "accepted" }).where(eq(categoryShareProposalsTable.id, id));

  res.status(201).json({ ...category, budget: null, createdAt: category.createdAt.toISOString() });
});

router.post("/category-share-proposals/:id/reject", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [proposal] = await db.select().from(categoryShareProposalsTable).where(eq(categoryShareProposalsTable.id, id));
  if (!proposal || proposal.targetUserId !== userId) { res.status(404).json({ error: "Proposal not found" }); return; }
  if (proposal.status !== "pending") { res.status(409).json({ error: "Proposal already resolved" }); return; }

  await db.update(categoryShareProposalsTable).set({ status: "rejected" }).where(eq(categoryShareProposalsTable.id, id));

  res.sendStatus(204);
});

export default router;
