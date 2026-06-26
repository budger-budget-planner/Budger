import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /webhook/token — get or lazily generate the session user's unique webhook token
router.get("/webhook/token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, webhookToken: usersTable.webhookToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let token = user.webhookToken;
  if (!token) {
    token = randomBytes(24).toString("hex");
    await db
      .update(usersTable)
      .set({ webhookToken: token })
      .where(eq(usersTable.id, userId));
  }

  res.json({ token });
});

// POST /webhook/apple/:token — receive Apple Pay transaction from iOS Shortcut (no session required)
router.post("/webhook/apple/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.webhookToken, token));

  if (!user) {
    res.status(404).json({ error: "Invalid token" });
    return;
  }

  // The iOS Shortcut sends: { "transaction": <Shortcut Input> }
  // iOS serialises the native Apple transaction object into the JSON value,
  // which may arrive as a nested object or as a stringified JSON string.
  const raw = req.body?.transaction;

  let payload: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      // raw is a plain string — leave payload empty and fall through to validation
      logger.warn({ raw }, "Apple Pay webhook: could not parse transaction string");
    }
  } else if (raw && typeof raw === "object") {
    payload = raw as Record<string, unknown>;
  }

  // ── Extract amount ────────────────────────────────────────────────────────
  let amount: number | null = null;
  const rawAmount = payload.amount;
  if (typeof rawAmount === "number") {
    amount = rawAmount;
  } else if (typeof rawAmount === "string") {
    const n = parseFloat(rawAmount);
    if (!isNaN(n)) amount = n;
  }

  // ── Extract currency ──────────────────────────────────────────────────────
  let currency: string | null = null;
  if (typeof payload.currency === "string") {
    currency = payload.currency.toUpperCase();
  } else if (typeof payload.currencyCode === "string") {
    currency = payload.currencyCode.toUpperCase();
  }

  // ── Extract merchant name ─────────────────────────────────────────────────
  // iOS exposes the merchant under different keys depending on iOS version
  let merchant: string | null = null;
  for (const key of ["merchant", "merchantName", "label", "paymentSummaryItemLabel", "description"]) {
    if (typeof payload[key] === "string" && (payload[key] as string).trim()) {
      merchant = (payload[key] as string).trim();
      break;
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  if (amount === null || !merchant) {
    logger.warn(
      { body: req.body, payload, amount, merchant },
      "Apple Pay webhook: missing required fields (amount or merchant)",
    );
    res.status(422).json({
      error: "Could not extract amount or merchant from payload",
      hint: "Ensure the Shortcut sends { \"transaction\": <Shortcut Input> } as JSON",
      received: payload,
    });
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      amount: String(amount),
      description: merchant,
      date: today,
      paymentMethod: "apple_pay",
      userId: user.id,
      householdId: user.householdId ?? null,
      categoryId: null,
    })
    .returning();

  logger.info(
    { txId: tx.id, userId: user.id, amount, currency, merchant },
    "Apple Pay webhook: transaction created",
  );

  res.status(201).json({ success: true, transactionId: tx.id });
});

export default router;
