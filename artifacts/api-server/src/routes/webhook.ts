import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getAutoCategory } from "../lib/merchantRules";

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
  // Two supported formats:
  //   A) Structured object from Apple Wallet automation (or JSON string thereof)
  //   B) Raw OCR text from Share Sheet, e.g. "mBank\nFruugo\n251,99 PLN"
  const raw = req.body?.transaction;

  let amount: number | null = null;
  let currency: string | null = null;
  let merchant: string | null = null;

  // ── Path A: structured object (or JSON-stringified object) ────────────────
  let payload: Record<string, unknown> = {};
  let usedStructuredPath = false;

  if (raw && typeof raw === "object") {
    payload = raw as Record<string, unknown>;
    usedStructuredPath = true;
  } else if (typeof raw === "string") {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        payload = parsed as Record<string, unknown>;
        usedStructuredPath = true;
      }
    } catch {
      // Not JSON — treat as raw OCR text (Path B below)
    }
  }

  // Log every call so we can debug what iOS actually sends
  logger.info({ rawBody: req.body, rawTransaction: raw, usedStructuredPath }, "Apple Pay webhook: payload received");
  // Also log the raw string to stdout for easy Shortcut debugging
  if (typeof raw === "string") {
    console.log("[Apple webhook] raw string received:", raw);
  }

  if (usedStructuredPath) {
    // ── Structured: extract amount ──────────────────────────────────────────
    // iOS serialises amounts with the device locale's decimal separator.
    // Polish locale uses comma: "320,00" — normalise to period before parsing.
    const rawAmount = payload.amount;
    if (typeof rawAmount === "number") {
      amount = rawAmount;
    } else if (typeof rawAmount === "string") {
      const normalised = rawAmount.replace(/\s/g, "").replace(",", ".");
      const n = parseFloat(normalised);
      if (!isNaN(n)) amount = n;
    }

    // ── Structured: extract currency ────────────────────────────────────────
    if (typeof payload.currency === "string") {
      currency = payload.currency.toUpperCase();
    } else if (typeof payload.currencyCode === "string") {
      currency = payload.currencyCode.toUpperCase();
    }

    // ── Structured: extract merchant ────────────────────────────────────────
    // iOS exposes the merchant under different keys depending on iOS version
    for (const key of ["merchant", "merchantName", "label", "paymentSummaryItemLabel", "description"]) {
      if (typeof payload[key] === "string" && (payload[key] as string).trim()) {
        merchant = (payload[key] as string).trim();
        break;
      }
    }
  } else if (typeof raw === "string") {
    // ── Path B: raw OCR text from Share Sheet ─────────────────────────────
    // Expected formats (newline-separated):
    //   "mBank\nFruugo\n251,99 PLN"
    //   "Card payment\nAmazon\n12.50 EUR\nsome extra text"
    //
    // Strategy:
    //   1. Find the amount using a regex for decimal numbers (comma or dot separator)
    //   2. Grab a 3-letter currency code if one appears right after the amount
    //   3. Use the second non-empty line as merchant; fall back to first line or full string

    logger.info({ rawText: raw }, "Apple Pay webhook: parsing as raw OCR text");

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Amount: match things like "251,99" / "251.99" / "1 234,00" / "1,234.00"
    // Must have at least 2 digits before the separator and exactly 2 after
    const amountMatch = raw.match(/\b(\d[\d\s]*[\.,]\d{2})\b/);
    if (amountMatch) {
      const normalised = amountMatch[1].replace(/\s/g, "").replace(",", ".");
      const n = parseFloat(normalised);
      if (!isNaN(n)) amount = n;
    }

    // Currency: optional 3-letter ISO code appearing after the amount
    const currencyMatch = raw.match(/\b(\d[\d\s]*[\.,]\d{2})\s+([A-Z]{3})\b/);
    if (currencyMatch?.[2]) {
      currency = currencyMatch[2].toUpperCase();
    }

    // Merchant: prefer second non-empty line (often: bank name, merchant, amount …)
    // Skip lines that look purely numeric / like an amount
    const amountLineRe = /^\d[\d\s]*[.,]\d{2}(\s+[A-Z]{3})?$/;
    const candidateLines = lines.filter(l => !amountLineRe.test(l));
    if (candidateLines.length >= 2) {
      merchant = candidateLines[1]; // second non-amount line is usually merchant
    } else if (candidateLines.length === 1) {
      merchant = candidateLines[0];
    } else {
      // Absolute fallback: use the whole string trimmed to 80 chars
      merchant = raw.slice(0, 80).trim();
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  if (amount === null || !merchant) {
    logger.warn(
      { body: req.body, payload, amount, merchant, rawTransaction: raw },
      "Apple Pay webhook: missing required fields (amount or merchant)",
    );
    res.status(422).json({
      error: "Could not extract amount or merchant from payload",
      hint: usedStructuredPath
        ? "Ensure the Shortcut sends { \"transaction\": <Shortcut Input> } as JSON"
        : "Raw text received but could not parse amount or merchant. Check the format.",
      received: usedStructuredPath ? payload : { rawText: raw },
    });
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  // Auto-apply merchant category rule if one is learned
  const autoCategory = await getAutoCategory(user.id, merchant);

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      amount: String(amount),
      description: merchant,
      date: today,
      paymentMethod: "apple_pay",
      userId: user.id,
      householdId: user.householdId ?? null,
      categoryId: autoCategory ?? null,
      categoryAutoAssigned: autoCategory != null,
      // Store the captured currency so the frontend can flag it as "convertible"
      transactionCurrency: currency ?? null,
    })
    .returning();

  logger.info(
    { txId: tx.id, userId: user.id, amount, currency, merchant },
    "Apple Pay webhook: transaction created",
  );

  res.status(201).json({ success: true, transactionId: tx.id });
});

export default router;
