import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getAutoCategory } from "../lib/merchantRules";

const router: IRouter = Router();

// ── Shared parsing types ──────────────────────────────────────────────────────

type ParsedTransaction = {
  amount: number;
  currency: string | null;
  merchant: string;
  path: "structured" | "raw_text";
};

type ParseFailure = {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  path: "structured" | "raw_text" | "unknown";
  error: string;
};

// ── Core parsing logic (shared between POST and POST /test) ───────────────────

function parseTransactionPayload(
  body: Record<string, unknown>,
): ParsedTransaction | ParseFailure {
  // iOS Shortcut sends { "transaction": <Shortcut Input> }
  // Two supported formats:
  //   A) Structured object from Apple Wallet automation (or JSON string thereof)
  //   B) Raw OCR text from Share Sheet, e.g. "mBank\nFruugo\n251,99 PLN"
  const raw = body?.transaction;

  let amount: number | null = null;
  let currency: string | null = null;
  let merchant: string | null = null;
  let path: "structured" | "raw_text" | "unknown" = "unknown";

  // ── Path A: structured object (or JSON-stringified object) ──────────────────
  let payload: Record<string, unknown> = {};
  let usedStructuredPath = false;

  if (raw && typeof raw === "object") {
    payload = raw as Record<string, unknown>;
    usedStructuredPath = true;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        payload = parsed as Record<string, unknown>;
        usedStructuredPath = true;
      }
    } catch {
      // Not JSON — treat as raw OCR text (Path B)
    }
  }

  if (usedStructuredPath) {
    path = "structured";

    // Amount — iOS may send comma decimal (Polish locale: "320,00")
    const rawAmount = payload.amount;
    if (typeof rawAmount === "number") {
      amount = rawAmount;
    } else if (typeof rawAmount === "string") {
      const n = parseFloat(rawAmount.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n)) amount = n;
    }

    // Currency
    if (typeof payload.currency === "string") {
      currency = payload.currency.toUpperCase();
    } else if (typeof payload.currencyCode === "string") {
      currency = payload.currencyCode.toUpperCase();
    }

    // Merchant — different keys across iOS versions
    for (const key of ["merchant", "merchantName", "label", "paymentSummaryItemLabel", "description"]) {
      if (typeof payload[key] === "string" && (payload[key] as string).trim()) {
        merchant = (payload[key] as string).trim();
        break;
      }
    }
  } else if (typeof raw === "string") {
    // ── Path B: raw OCR text from Share Sheet ───────────────────────────────
    // Expected formats (newline-separated):
    //   "mBank\nFruugo\n251,99 PLN"
    //   "Card payment\nAmazon\n12.50 EUR\nsome extra text"
    //   "Revolut\nNetflix\n€12,99"
    //   "Apple\nApp Store\n$4.99"
    path = "raw_text";

    console.log("[Apple webhook] raw string received:", raw);

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Currency symbol → ISO code mapping ($  £  €)
    const SYMBOL_MAP: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR" };

    // 1. Symbol-prefixed amount: $251.99 / £12,50 / €99.00
    const symbolMatch = raw.match(/([$£€])\s*(\d[\d\s]*[\.,]\d{2})\b/);
    if (symbolMatch) {
      currency = SYMBOL_MAP[symbolMatch[1]] ?? null;
      const n = parseFloat(symbolMatch[2].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(n)) amount = n;
    }

    // 2. Amount followed by ISO code or PLN variants: "251,99 PLN" / "251,99 zł" / "251,99 zl"
    //    Overrides currency from symbol path if present; also fills amount if not yet found.
    const suffixMatch = raw.match(/\b(\d[\d\s]*[\.,]\d{2})\s+([A-Z]{3}|zł|zl)\b/i);
    if (suffixMatch) {
      const code = suffixMatch[2].toLowerCase();
      currency = (code === "zł" || code === "zl") ? "PLN" : suffixMatch[2].toUpperCase();
      if (amount === null) {
        const n = parseFloat(suffixMatch[1].replace(/\s/g, "").replace(",", "."));
        if (!isNaN(n)) amount = n;
      }
    }

    // 3. Fallback: plain decimal number with no currency marker
    if (amount === null) {
      const plainMatch = raw.match(/\b(\d[\d\s]*[\.,]\d{2})\b/);
      if (plainMatch) {
        const n = parseFloat(plainMatch[1].replace(/\s/g, "").replace(",", "."));
        if (!isNaN(n)) amount = n;
      }
    }

    // Merchant — prefer second non-amount line (typical order: bank, merchant, amount)
    const amountLineRe = /^[$£€]?\s*\d[\d\s]*[.,]\d{2}(\s+([A-Z]{3}|zł|zl))?$/i;
    const candidateLines = lines.filter(l => !amountLineRe.test(l));
    if (candidateLines.length >= 2) {
      merchant = candidateLines[1];
    } else if (candidateLines.length === 1) {
      merchant = candidateLines[0];
    } else {
      merchant = raw.slice(0, 80).trim();
    }
  }

  if (amount === null || !merchant) {
    return {
      amount,
      currency,
      merchant,
      path,
      error: "Could not extract amount or merchant from payload",
    };
  }

  // At this point path is always "structured" or "raw_text" — "unknown" only
  // occurs when raw is neither string nor object, making extraction impossible.
  return { amount, currency, merchant, path: path as "structured" | "raw_text" };
}

// ── GET /webhook/budger-logo.svg ─────────────────────────────────────────────

const BUDGER_LOGO_SVG = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Budger badger logo">
  <defs>
    <linearGradient id="bgBorderGrad" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#999"/>
      <stop offset="55%" stop-color="#505050"/>
      <stop offset="100%" stop-color="#2a2a2a"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="#111"/>
  <rect x="1" y="1" width="98" height="98" rx="21.5" fill="none" stroke="url(#bgBorderGrad)" stroke-width="1.5"/>
  <ellipse cx="50" cy="52" rx="42" ry="34" fill="#F0EDE6"/>
  <ellipse cx="19" cy="24" rx="12" ry="11" fill="#777"/>
  <ellipse cx="81" cy="24" rx="12" ry="11" fill="#777"/>
  <ellipse cx="19" cy="25" rx="7" ry="6.5" fill="#aaa"/>
  <ellipse cx="81" cy="25" rx="7" ry="6.5" fill="#aaa"/>
  <path d="M 33 74 Q 24 60 20 46 Q 17 33 20 22" stroke="#111" stroke-width="27" stroke-linecap="round" fill="none"/>
  <path d="M 67 74 Q 76 60 80 46 Q 83 33 80 22" stroke="#111" stroke-width="27" stroke-linecap="round" fill="none"/>
  <ellipse cx="50" cy="40" rx="10" ry="18" fill="#F0EDE6"/>
  <ellipse cx="10" cy="52" rx="13" ry="19" fill="#F0EDE6"/>
  <ellipse cx="90" cy="52" rx="13" ry="19" fill="#F0EDE6"/>
  <ellipse cx="50" cy="70" rx="20" ry="14" fill="#E8E4DC"/>
  <circle cx="29" cy="48" r="10.5" fill="white"/>
  <circle cx="71" cy="48" r="10.5" fill="white"/>
  <circle cx="30" cy="49" r="7" fill="#0d0d0d"/>
  <circle cx="70" cy="49" r="7" fill="#0d0d0d"/>
  <circle cx="32.5" cy="47" r="2.5" fill="white"/>
  <circle cx="72.5" cy="47" r="2.5" fill="white"/>
  <ellipse cx="50" cy="67" rx="9" ry="7" fill="#111"/>
  <ellipse cx="47" cy="65" rx="3" ry="2.2" fill="#2a2a2a"/>
  <path d="M 41 73 Q 50 81 59 73" stroke="#999" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

router.get("/webhook/budger-logo.svg", (_req, res): void => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(BUDGER_LOGO_SVG);
});

// ── GET /webhook/token ────────────────────────────────────────────────────────

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

// ── POST /webhook/apple/:token/test — dry-run parse, no DB write ──────────────
//
// Send the exact same JSON body you use for the live endpoint.
// Returns what would be extracted (amount, currency, merchant, path) without
// saving anything. Safe to call as many times as you like from Shortcuts.

router.post("/webhook/apple/:token/test", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.webhookToken, token));

  if (!user) {
    res.status(404).json({ error: "Invalid token" });
    return;
  }

  logger.info({ body: req.body }, "Apple webhook /test: dry-run parse");

  const result = parseTransactionPayload(req.body);

  if ("error" in result) {
    res.status(422).json({
      ok: false,
      user: user.name,
      ...result,
      hint: result.path === "structured"
        ? "Structured payload missing amount or merchant fields"
        : "Raw text parsed but could not extract amount or merchant — check the format",
      rawTransaction: req.body?.transaction ?? null,
    });
    return;
  }

  const logoUrl = `${req.protocol}://${req.get("host")}/api/webhook/budger-logo.svg`;

  res.json({
    ok: true,
    user: user.name,
    parsed: {
      amount: result.amount,
      currency: result.currency,
      merchant: result.merchant,
      path: result.path,
    },
    preview: `Would save: ${result.merchant} — ${result.amount}${result.currency ? " " + result.currency : ""}`,
    logo_url: logoUrl,
  });
});

// ── POST /webhook/apple/:token — live endpoint, saves to DB ──────────────────

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

  logger.info(
    { rawBody: req.body, rawTransaction: req.body?.transaction },
    "Apple Pay webhook: payload received",
  );

  const result = parseTransactionPayload(req.body);

  if ("error" in result) {
    logger.warn(
      { body: req.body, ...result },
      "Apple Pay webhook: missing required fields (amount or merchant)",
    );
    res.status(422).json({
      error: result.error,
      hint: result.path === "structured"
        ? 'Ensure the Shortcut sends { "transaction": <Shortcut Input> } as JSON'
        : "Raw text received but could not parse amount or merchant. Check the format.",
      received: result.path === "structured"
        ? req.body?.transaction
        : { rawText: req.body?.transaction },
    });
    return;
  }

  const { amount, currency, merchant } = result;
  const today = new Date().toISOString().split("T")[0];
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
      transactionCurrency: currency ?? null,
    })
    .returning();

  logger.info(
    { txId: tx.id, userId: user.id, amount, currency, merchant },
    "Apple Pay webhook: transaction created",
  );

  const logoUrl = `${req.protocol}://${req.get("host")}/api/webhook/budger-logo.svg`;
  const preview = `Saved: ${merchant} — ${amount}${currency ? " " + currency : ""}`;

  res.status(201).json({ success: true, transactionId: tx.id, preview, logo_url: logoUrl });
});

export default router;
