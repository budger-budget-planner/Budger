import { Router, type IRouter } from "express";
import {
  db, greatLarderEntriesTable, larderEntriesTable,
  transactionsTable, usersTable, householdMembersTable,
  categoriesTable,
  notificationItemsTable, goalsTable, goalContributionsTable,
} from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { fetchRates, convertAmount } from "../lib/rates";
import { currencyBalances, resolveAssetCurrency, round2, assertSufficientAssetBalance, AssetSelectionError } from "../lib/larder-allocation";
import { sendPushToUser } from "../lib/push-sender";
import { getUnreadNotificationCount } from "../lib/notification-counts";

const router: IRouter = Router();

export const GREAT_LARDER_BUCKETS = ["soft_savings", "hard_savings", "investments"] as const;
type GreatLarderBucket = typeof GREAT_LARDER_BUCKETS[number];

function parseBucket(value: unknown): GreatLarderBucket | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && (GREAT_LARDER_BUCKETS as readonly string[]).includes(value)
    ? value as GreatLarderBucket
    : null;
}

function bucketFromBody(value: unknown): { bucket: GreatLarderBucket | null; valid: boolean } {
  if (value === undefined) return { bucket: null, valid: true };
  const bucket = parseBucket(value);
  return { bucket, valid: value == null || value === "" || bucket !== null };
}

function isHead(role: string) { return role === "head" || role === "owner"; }
function isParent(role: string) { return isHead(role) || role === "parent"; }

function todayStr(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

async function getMembership(userId: number, householdId: number) {
  const [m] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  return m ?? null;
}

async function getHeadIds(householdId: number): Promise<number[]> {
  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
  return members.filter(m => isHead(m.role)).map(m => m.userId);
}

function fmtEntry(e: typeof greatLarderEntriesTable.$inferSelect, contributorName: string) {
  return {
    id: e.id,
    householdId: e.householdId,
    contributedByUserId: e.contributedByUserId,
    contributorName,
    amount: parseFloat(e.amount),
    currency: e.currency,
    sourceType: e.sourceType,
    status: e.status,
    transactionId: e.transactionId ?? null,
    goalId: e.goalId ?? null,
    bucket: e.bucket ?? null,
    note: e.note ?? null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

// GET /great-larder — household Great Larder total + entries
// Only visible to head/parent roles.
router.get("/great-larder", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can view the Great Larder" }); return;
  }

  const currency = user.currency ?? "USD";

  const entries = await db.select().from(greatLarderEntriesTable)
    .where(eq(greatLarderEntriesTable.householdId, user.householdId))
    .orderBy(desc(greatLarderEntriesTable.createdAt));

  // Fetch contributor names
  const memberIds = [...new Set(entries.map(e => e.contributedByUserId))];
  const members = memberIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const nameMap = new Map(members.map(m => [m.id, m.name]));

  const approved = entries.filter(e => e.status === "approved");

  // Group approved amounts by currency for breakdown display
  const currencyMap = new Map<string, number>();
  for (const e of approved) {
    const c = e.currency || currency;
    currencyMap.set(c, (currencyMap.get(c) ?? 0) + parseFloat(e.amount));
  }

  // Convert each currency sub-total to the account currency and sum
  const rates = await fetchRates();
  const total = Array.from(currencyMap.entries()).reduce((sum, [curr, amt]) => {
    return sum + convertAmount(amt, curr, currency, rates);
  }, 0);

  // Build breakdown: only non-zero sub-totals
  const currencyBreakdown = Array.from(currencyMap.entries())
    .filter(([, amt]) => Math.abs(amt) >= 0.005)
    .map(([c, rawTotal]) => ({ currency: c, rawTotal: parseFloat(rawTotal.toFixed(2)) }));

  const pendingCount = entries.filter(e => e.status === "pending").length;
  const buckets = GREAT_LARDER_BUCKETS.map(bucket => {
    const bucketEntries = approved.filter(e => e.bucket === bucket);
    const map = new Map<string, number>();
    for (const e of bucketEntries) {
      const c = e.currency || currency;
      map.set(c, (map.get(c) ?? 0) + parseFloat(e.amount));
    }
    const total = Array.from(map.entries()).reduce(
      (sum, [curr, amount]) => sum + convertAmount(amount, curr, currency, rates), 0,
    );
    return {
      bucket,
      total: parseFloat(total.toFixed(2)),
      currencyBreakdown: Array.from(map.entries())
        .filter(([, amount]) => Math.abs(amount) >= 0.005)
        .map(([c, rawTotal]) => ({ currency: c, rawTotal: parseFloat(rawTotal.toFixed(2)) })),
    };
  });
  const unassignedMap = new Map<string, number>();
  for (const e of approved.filter(e => e.bucket == null)) {
    const c = e.currency || currency;
    unassignedMap.set(c, (unassignedMap.get(c) ?? 0) + parseFloat(e.amount));
  }
  const unassignedTotal = Array.from(unassignedMap.entries()).reduce(
    (sum, [curr, amount]) => sum + convertAmount(amount, curr, currency, rates), 0,
  );

  res.json({
    total: parseFloat(total.toFixed(2)),
    currency,
    pendingCount,
    currencyBreakdown,
    buckets,
    unassigned: {
      total: parseFloat(unassignedTotal.toFixed(2)),
      currencyBreakdown: Array.from(unassignedMap.entries())
        .filter(([, amount]) => Math.abs(amount) >= 0.005)
        .map(([c, rawTotal]) => ({ currency: c, rawTotal: parseFloat(rawTotal.toFixed(2)) })),
    },
    entries: entries.map(e => fmtEntry(e, nameMap.get(e.contributedByUserId) ?? "Unknown")),
  });
});

// POST /great-larder/assign — head-only, atomic assignment from the waiting room.
router.post("/great-larder/assign", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }
  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can assign Great Larder funds" }); return;
  }

  const { amount, currency, bucket: rawBucket } = req.body;
  const { bucket, valid } = bucketFromBody(rawBucket);
  if (!valid || !bucket) { res.status(400).json({ error: "A valid bucket is required" }); return; }
  if (typeof amount !== "number" || amount <= 0 || !isFinite(amount)) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (typeof currency !== "string" || !currency.trim()) {
    res.status(400).json({ error: "currency is required" }); return;
  }

  const approvedUnassigned = (await db.select().from(greatLarderEntriesTable).where(
    eq(greatLarderEntriesTable.householdId, user.householdId),
  )).filter(e => e.status === "approved" && e.bucket == null);
  const balances = currencyBalances(approvedUnassigned);
  const nativeAmount = round2(amount);
  try {
    assertSufficientAssetBalance(balances, currency.trim(), nativeAmount);
  } catch (err) {
    res.status(400).json({ error: err instanceof AssetSelectionError ? err.message : "Insufficient Unassigned balance" }); return;
  }

  const entry = await db.transaction(async tx => {
    await tx.insert(greatLarderEntriesTable).values({
      householdId: user.householdId,
      contributedByUserId: userId,
      amount: String(-nativeAmount),
      currency: currency.trim(),
      sourceType: "bucket_assignment",
      status: "approved",
      note: `Assigned to ${bucket}`,
    });
    const [created] = await tx.insert(greatLarderEntriesTable).values({
      householdId: user.householdId,
      contributedByUserId: userId,
      amount: String(nativeAmount),
      currency: currency.trim(),
      sourceType: "bucket_assignment",
      status: "approved",
      bucket,
      note: `Assigned to ${bucket}`,
    }).returning();
    return created;
  });
  res.status(201).json(fmtEntry(entry, user.name ?? "Unknown"));
});

// POST /great-larder/send — transfer from personal Larder to Great Larder
// Body: { amount } or { percent } (of personal larder balance)
router.post("/great-larder/send", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const { amount: rawAmount, percent, assetCurrency: assetCurrencyInput, bucket: rawBucket } = req.body;
  const { bucket, valid: bucketValid } = bucketFromBody(rawBucket);
  if (!bucketValid) { res.status(400).json({ error: "Invalid bucket" }); return; }

  if (typeof percent === "number" && (percent <= 0 || percent > 100)) {
    res.status(400).json({ error: "percent must be between 1 and 100" }); return;
  }
  if (typeof percent !== "number" && typeof rawAmount !== "number") {
    res.status(400).json({ error: "amount or percent is required" }); return;
  }

  let transfer: {
    entry: typeof greatLarderEntriesTable.$inferSelect;
    contributorName: string;
  } | null;
  try {
    transfer = await db.transaction(async (tx) => {
      // Serialize all transfers from this personal Larder. The balance is
      // append-only, so locking the stable user row prevents two concurrent
      // requests from both passing the same pre-debit balance check.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const [lockedUser] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!lockedUser?.householdId) return null;

      const personalEntries = await tx.select().from(larderEntriesTable).where(and(
        eq(larderEntriesTable.userId, userId),
        bucket === null ? sql`${larderEntriesTable.bucket} IS NULL` : eq(larderEntriesTable.bucket, bucket),
      ));
      const balances = currencyBalances(personalEntries);
      const assetCurrency = resolveAssetCurrency(balances, assetCurrencyInput);
      const assetBalance = balances.find(b => b.currency === assetCurrency)!.amount;

      // Amount/percent are denominated in the selected Asset's own currency.
      const nativeAmount = typeof percent === "number"
        ? round2(assetBalance * percent / 100)
        : round2(rawAmount as number);
      if (nativeAmount <= 0) throw new AssetSelectionError("amount must be positive");
      assertSufficientAssetBalance(balances, assetCurrency, nativeAmount);

      // Keep the personal debit and household credit in the same transaction.
      await tx.insert(larderEntriesTable).values({
        userId,
        amount: String(-nativeAmount),
        currency: assetCurrency,
        sourceType: "great_larder_transfer",
        bucket,
      });

      const [entry] = await tx.insert(greatLarderEntriesTable).values({
        householdId: lockedUser.householdId,
        contributedByUserId: userId,
        amount: String(nativeAmount),
        currency: assetCurrency,
        sourceType: "member_transfer",
        status: "approved",
        bucket: null,
        note: "From personal Larder",
      }).returning();

      return {
        entry,
        contributorName: lockedUser.name ?? "Unknown",
      };
    });
  } catch (err) {
    if (err instanceof AssetSelectionError) {
      res.status(400).json({ error: err.message }); return;
    }
    throw err;
  }

  if (!transfer) {
    res.status(400).json({ error: "Not in a household" }); return;
  }
  res.status(201).json(fmtEntry(transfer.entry, transfer.contributorName));
});

// POST /great-larder/fund — create a fund transaction; requires head approval
// Body: { description, amount, larderAmount, categoryId?, date? }
router.post("/great-larder/fund", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can fund the Great Larder" }); return;
  }

  const { description, amount, larderAmount, categoryId, date } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (typeof larderAmount !== "number" || larderAmount <= 0 || larderAmount > amount) {
    res.status(400).json({ error: "larderAmount must be between 0 and amount" }); return;
  }
  if (categoryId !== undefined && categoryId !== null &&
      (typeof categoryId !== "number" || !Number.isInteger(categoryId) || categoryId <= 0)) {
    res.status(400).json({ error: "categoryId must be a positive integer" }); return;
  }
  if (categoryId !== undefined && categoryId !== null) {
    const [category] = await db.select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.userId, userId)));
    if (!category) {
      res.status(400).json({ error: "Category not found" }); return;
    }
  }

  const currency = user.currency ?? "USD";
  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

  // Head auto-approves their own fund requests; parents need approval
  const status = isHead(membership.role) ? "approved" : "pending";

  // The visible transaction and the Great Larder ledger entry are one logical
  // operation. Keep them in one database transaction so a failed second write
  // cannot leave a transaction without its corresponding ledger row.
  const { transactionRecord, entry } = await db.transaction(async (txDb) => {
    const [createdTransaction] = await txDb.insert(transactionsTable).values({
      userId,
      householdId: user.householdId,
      amount: String(amount),
      description: description.trim(),
      categoryId: categoryId ?? null,
      date: dateStr,
      paymentMethod: "card",
      isLarderFund: true,
      larderAmount: String(larderAmount),
      transactionCurrency: currency,
    }).returning();

    const [createdEntry] = await txDb.insert(greatLarderEntriesTable).values({
      householdId: user.householdId,
      contributedByUserId: userId,
      amount: String(larderAmount),
      currency,
      sourceType: "fund",
      status,
      transactionId: createdTransaction.id,
      note: description.trim(),
    }).returning();

    return { transactionRecord: createdTransaction, entry: createdEntry };
  });

  // If pending, notify all heads
  if (status === "pending") {
    const headIds = await getHeadIds(user.householdId);
    for (const headId of headIds) {
      const dedupKey = `great-larder-fund-pending-${entry.id}`;
      await db.insert(notificationItemsTable).values({
        userId: headId,
        type: "great_larder_fund_pending",
        titleEn: "Great Larder fund request",
        titlePl: "Wniosek o zasilenie Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to add ${larderAmount} ${currency} to the Great Larder`,
        bodyPl: `${user.name} chce dodać ${larderAmount} ${currency} do Wielkiej Spiżarni`,
        dedupKey,
      }).onConflictDoNothing();

      // Real system push, mirroring the in-app NC row just written.
      const fundBadge = await getUnreadNotificationCount(headId);
      sendPushToUser(headId, {
        title: "Great Larder fund request",
        body: `${user.name} wants to add ${larderAmount} ${currency} to the Great Larder`,
        titleEn: "Great Larder fund request",
        titlePl: "Wniosek o zasilenie Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to add ${larderAmount} ${currency} to the Great Larder`,
        bodyPl: `${user.name} chce dodać ${larderAmount} ${currency} do Wielkiej Spiżarni`,
        url: "/?sheet=great-larder",
        tag: dedupKey,
        badgeCount: fundBadge,
      }).catch(() => {});
    }
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({
    ...fmtEntry(entry, u?.name ?? "Unknown"),
    transactionId: transactionRecord.id,
    requiresApproval: status === "pending",
  });
});

// POST /great-larder/entries/:id/approve — head approves a pending fund entry
router.post("/great-larder/entries/:id/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const entryId = parseInt(req.params.id);
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can approve fund requests" }); return;
  }

  const [entry] = await db.select().from(greatLarderEntriesTable)
    .where(and(eq(greatLarderEntriesTable.id, entryId), eq(greatLarderEntriesTable.householdId, user.householdId)));
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  if (entry.status !== "pending") { res.status(409).json({ error: "Entry is not pending" }); return; }

  const [updated] = await db.update(greatLarderEntriesTable)
    .set({ status: "approved", approvedByUserId: userId, approvedAt: new Date() })
    .where(eq(greatLarderEntriesTable.id, entryId))
    .returning();

  // Notify the contributor
  await db.insert(notificationItemsTable).values({
    userId: entry.contributedByUserId,
    type: "great_larder_fund_approved",
    titleEn: "Great Larder fund approved",
    titlePl: "Wniosek zaakceptowany",
    bodyEn: `Your fund of ${entry.amount} ${entry.currency} was approved and added to the Great Larder`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} został zaakceptowany`,
    dedupKey: `great-larder-fund-approved-${entryId}`,
  }).onConflictDoNothing();

  // Real system push, mirroring the in-app NC row just written.
  const approvedBadge = await getUnreadNotificationCount(entry.contributedByUserId);
  sendPushToUser(entry.contributedByUserId, {
    title: "Great Larder fund approved",
    body: `Your fund of ${entry.amount} ${entry.currency} was approved and added to the Great Larder`,
    titleEn: "Great Larder fund approved",
    titlePl: "Wniosek zaakceptowany",
    bodyEn: `Your fund of ${entry.amount} ${entry.currency} was approved and added to the Great Larder`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} został zaakceptowany`,
    url: "/?sheet=great-larder",
    tag: `great-larder-fund-approved-${entryId}`,
    badgeCount: approvedBadge,
  }).catch(() => {});

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, entry.contributedByUserId));
  res.json(fmtEntry(updated, u?.name ?? "Unknown"));
});

// POST /great-larder/entries/:id/reject — head rejects a pending fund entry
router.post("/great-larder/entries/:id/reject", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const entryId = parseInt(req.params.id);
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can reject fund requests" }); return;
  }

  const [entry] = await db.select().from(greatLarderEntriesTable)
    .where(and(eq(greatLarderEntriesTable.id, entryId), eq(greatLarderEntriesTable.householdId, user.householdId)));
  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  if (entry.status !== "pending") { res.status(409).json({ error: "Entry is not pending" }); return; }

  const [updated] = await db.update(greatLarderEntriesTable)
    .set({ status: "rejected", approvedByUserId: userId, approvedAt: new Date() })
    .where(eq(greatLarderEntriesTable.id, entryId))
    .returning();

  // Notify the contributor
  await db.insert(notificationItemsTable).values({
    userId: entry.contributedByUserId,
    type: "great_larder_fund_rejected",
    titleEn: "Great Larder fund rejected",
    titlePl: "Wniosek odrzucony",
    bodyEn: `Your fund request of ${entry.amount} ${entry.currency} was not approved`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} nie został zaakceptowany`,
    dedupKey: `great-larder-fund-rejected-${entryId}`,
  }).onConflictDoNothing();

  // Real system push, mirroring the in-app NC row just written.
  const rejectedBadge = await getUnreadNotificationCount(entry.contributedByUserId);
  sendPushToUser(entry.contributedByUserId, {
    title: "Great Larder fund rejected",
    body: `Your fund request of ${entry.amount} ${entry.currency} was not approved`,
    titleEn: "Great Larder fund rejected",
    titlePl: "Wniosek odrzucony",
    bodyEn: `Your fund request of ${entry.amount} ${entry.currency} was not approved`,
    bodyPl: `Twój wniosek o ${entry.amount} ${entry.currency} nie został zaakceptowany`,
    url: "/?sheet=great-larder",
    tag: `great-larder-fund-rejected-${entryId}`,
    badgeCount: rejectedBadge,
  }).catch(() => {});

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, entry.contributedByUserId));
  res.json(fmtEntry(updated, u?.name ?? "Unknown"));
});

// POST /great-larder/spend — spend FROM Great Larder; creates transaction, head auto-approved, parent pending
// Body: { description, amount, categoryId?, date? }
router.post("/great-larder/spend", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isParent(membership.role)) {
    res.status(403).json({ error: "Only parents and the head can spend from the Great Larder" }); return;
  }

  const { description, amount, categoryId, date, assetCurrency: assetCurrencyInput, bucket: rawBucket } = req.body;
  const { bucket, valid: bucketValid } = bucketFromBody(rawBucket);
  if (!bucketValid) { res.status(400).json({ error: "Invalid bucket" }); return; }
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  if (categoryId !== undefined && categoryId !== null &&
      (typeof categoryId !== "number" || !Number.isInteger(categoryId) || categoryId <= 0)) {
    res.status(400).json({ error: "categoryId must be a positive integer" }); return;
  }
  if (categoryId !== undefined && categoryId !== null) {
    const [category] = await db.select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.userId, userId)));
    if (!category) {
      res.status(400).json({ error: "Category not found" }); return;
    }
  }

  const currency = user.currency ?? "USD";
  const rates = await fetchRates();
  const dateStr = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr();

  const status = isHead(membership.role) ? "approved" : "pending";
  const nativeAmount = round2(amount);

  let result: {
    transactionRecord: typeof transactionsTable.$inferSelect;
    entry: typeof greatLarderEntriesTable.$inferSelect;
    assetCurrency: string;
  };
  try {
    result = await db.transaction(async (txDb) => {
      // Lock a stable household row while checking and debiting the selected
      // bucket/currency. This serializes concurrent Great Larder spends even
      // though the balance itself is represented by append-only ledger rows.
      await txDb.execute(sql`SELECT id FROM households WHERE id = ${user.householdId} FOR UPDATE`);

      const allEntries = await txDb.select().from(greatLarderEntriesTable)
        .where(eq(greatLarderEntriesTable.householdId, user.householdId));
      const approvedEntries = allEntries.filter(e => e.status === "approved" && e.bucket === bucket);
      const balances = currencyBalances(approvedEntries);
      const assetCurrency = resolveAssetCurrency(balances, assetCurrencyInput);
      assertSufficientAssetBalance(balances, assetCurrency, nativeAmount);
      const accountAmount = round2(convertAmount(nativeAmount, assetCurrency, currency, rates));

      const [createdTransaction] = await txDb.insert(transactionsTable).values({
        userId,
        householdId: user.householdId,
        amount: String(accountAmount),
        description: description.trim(),
        categoryId: categoryId ?? null,
        date: dateStr,
        paymentMethod: "card",
        isLarderFund: true,
        larderAmount: String(accountAmount),
        transactionCurrency: currency,
      }).returning();

      const [createdEntry] = await txDb.insert(greatLarderEntriesTable).values({
        householdId: user.householdId,
        contributedByUserId: userId,
        amount: String(-nativeAmount),
        currency: assetCurrency,
        sourceType: "spend",
        status,
        transactionId: createdTransaction.id,
        note: description.trim(),
        bucket,
      }).returning();

      return { transactionRecord: createdTransaction, entry: createdEntry, assetCurrency };
    });
  } catch (err) {
    if (err instanceof AssetSelectionError) {
      res.status(400).json({ error: err.message }); return;
    }
    throw err;
  }

  if (status === "pending") {
    const headIds = await getHeadIds(user.householdId);
    for (const headId of headIds) {
      await db.insert(notificationItemsTable).values({
        userId: headId,
        type: "great_larder_fund_pending",
        titleEn: "Great Larder spend request",
        titlePl: "Wniosek o wydatek z Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to spend ${nativeAmount} ${result.assetCurrency} from the Great Larder`,
        bodyPl: `${user.name} chce wydać ${nativeAmount} ${result.assetCurrency} z Wielkiej Spiżarni`,
        dedupKey: `great-larder-spend-pending-${result.entry.id}`,
      }).onConflictDoNothing();

      // Real system push, mirroring the in-app NC row just written.
      const spendBadge = await getUnreadNotificationCount(headId);
      sendPushToUser(headId, {
        title: "Great Larder spend request",
        body: `${user.name} wants to spend ${nativeAmount} ${result.assetCurrency} from the Great Larder`,
        titleEn: "Great Larder spend request",
        titlePl: "Wniosek o wydatek z Wielkiej Spiżarni",
        bodyEn: `${user.name} wants to spend ${nativeAmount} ${result.assetCurrency} from the Great Larder`,
        bodyPl: `${user.name} chce wydać ${nativeAmount} ${result.assetCurrency} z Wielkiej Spiżarni`,
        url: "/?sheet=great-larder",
        tag: `great-larder-spend-pending-${result.entry.id}`,
        badgeCount: spendBadge,
      }).catch(() => {});
    }
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({
    ...fmtEntry(result.entry, u?.name ?? "Unknown"),
    transactionId: result.transactionRecord.id,
    requiresApproval: status === "pending",
  });
});

// POST /great-larder/dedicate-to-goal — head moves Great Larder funds into a household goal contribution
// Body: { goalId, amount }
router.post("/great-larder/dedicate-to-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const membership = await getMembership(userId, user.householdId);
  if (!membership || !isHead(membership.role)) {
    res.status(403).json({ error: "Only the head can dedicate Great Larder funds to a goal" }); return;
  }

  const { goalId, amount, assetCurrency: assetCurrencyInput, bucket: rawBucket } = req.body;
  const { bucket, valid: bucketValid } = bucketFromBody(rawBucket);
  if (!bucketValid) { res.status(400).json({ error: "Invalid bucket" }); return; }
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  const allEntries = await db.select().from(greatLarderEntriesTable)
    .where(eq(greatLarderEntriesTable.householdId, user.householdId));
  const approvedEntries = allEntries.filter(e => e.status === "approved" && e.bucket === bucket);
  const balance = approvedEntries.reduce((s, e) => s + parseFloat(e.amount), 0);
  const balances = currencyBalances(approvedEntries);
  let assetCurrency: string;
  const nativeAmount = round2(amount);
  try {
    assetCurrency = resolveAssetCurrency(balances, assetCurrencyInput);
    assertSufficientAssetBalance(balances, assetCurrency, nativeAmount);
  } catch (err) {
    res.status(400).json({ error: err instanceof AssetSelectionError ? err.message : "Insufficient Great Larder balance" }); return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, goalId));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  if (goal.householdId !== user.householdId) {
    res.status(403).json({ error: "Goal does not belong to this household" }); return;
  }

  const currency = user.currency ?? "USD";
  const rates = await fetchRates();
  const accountAmount = round2(convertAmount(nativeAmount, assetCurrency, currency, rates));
  const currentMonth = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();

  await db.insert(greatLarderEntriesTable).values({
    householdId: user.householdId,
    contributedByUserId: userId,
    amount: String(-nativeAmount),
    currency: assetCurrency,
    sourceType: "goal_dedication",
    status: "approved",
    goalId,
    note: `Dedicated to goal: ${goal.name}`,
    bucket,
  });

  const [contrib] = await db.insert(goalContributionsTable).values({
    goalId,
    amount: String(accountAmount),
    currency,
    accountAmount: String(accountAmount),
    accountCurrency: currency,
    month: currentMonth,
    userId,
    householdId: user.householdId,
  }).returning();

  res.status(201).json({ success: true, contributionId: contrib.id, newBalance: balance - accountAmount });
});

// POST /great-larder/save-from-goal — move money from a completed household goal into the Great Larder.
// Body: { goalId, amount }; Idempotency-Key is required so a lost response can be retried safely.
// Any household member can save their own contributions into the GL (auto-approved).
router.post("/great-larder/save-from-goal", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const { goalId, amount } = req.body;
  if (!goalId || typeof goalId !== "number") {
    res.status(400).json({ error: "goalId is required" }); return;
  }
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  const idempotencyKey = req.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    res.status(400).json({ error: "Idempotency-Key header is required" }); return;
  }

  const currency = user.currency ?? "USD";

  const result = await db.transaction(async (tx) => {
    // Serialize saves and regular goal contributions for this goal. The
    // idempotency lookup and contribution check must both happen after the
    // lock, otherwise concurrent requests can spend the same contribution.
    await tx.execute(sql`SELECT id FROM goals WHERE id = ${goalId} FOR UPDATE`);

    const [goal] = await tx.select().from(goalsTable).where(eq(goalsTable.id, goalId));
    if (!goal) return { kind: "missing" as const };
    if (goal.householdId !== user.householdId) return { kind: "forbidden" as const };

    const [existingEntry] = await tx.select().from(greatLarderEntriesTable).where(and(
      eq(greatLarderEntriesTable.contributedByUserId, userId),
      eq(greatLarderEntriesTable.idempotencyKey, idempotencyKey),
    ));
    if (existingEntry) {
      const sameRequest = existingEntry.sourceType === "goal_save"
        && existingEntry.goalId === goalId
        && Math.abs(parseFloat(existingEntry.amount) - amount) <= 0.001;
      return sameRequest
        ? { kind: "saved" as const, entry: existingEntry, replayed: true }
        : { kind: "conflict" as const };
    }

    // Only let a user save out of the amount THEY contributed to this goal.
    const myContribs = await tx.select().from(goalContributionsTable)
      .where(and(eq(goalContributionsTable.goalId, goalId), eq(goalContributionsTable.userId, userId)));
    const myTotal = myContribs.reduce((s, c) => s + parseFloat(String(c.accountAmount ?? c.amount)), 0);
    if (amount > myTotal + 0.001) return { kind: "exceeds-contribution" as const };

    // Keep the offset and the Great Larder credit in one transaction. A
    // failure in either write rolls back both, so the same key can retry.
    await tx.insert(goalContributionsTable).values({
      goalId,
      amount: String(-amount),
      currency: goal.currency ?? currency,
      accountAmount: String(-amount),
      accountCurrency: currency,
      month: currentMonth(),
      userId,
      householdId: user.householdId,
    });

    const [entry] = await tx.insert(greatLarderEntriesTable).values({
      householdId: user.householdId,
      contributedByUserId: userId,
      amount: String(amount),
      currency,
      sourceType: "goal_save",
      status: "approved",
      goalId,
      idempotencyKey,
      note: `Saved from household goal: ${goal.name}`,
    }).returning();

    return { kind: "saved" as const, entry, replayed: false };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  if (result.kind === "forbidden") {
    res.status(403).json({ error: "Goal does not belong to this household" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Idempotency-Key was already used for a different goal save" });
    return;
  }
  if (result.kind === "exceeds-contribution") {
    res.status(400).json({ error: "Amount exceeds your contribution to this goal" });
    return;
  }

  res.status(result.replayed ? 200 : 201).json({
    success: true,
    replayed: result.replayed,
    entry: fmtEntry(result.entry, user.name ?? "Unknown"),
  });
});

export default router;
