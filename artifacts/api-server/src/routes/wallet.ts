import { Router, type IRouter } from "express";
import { db, usersTable, transactionsTable, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const router: IRouter = Router();

// ── Currency symbol map ──────────────────────────────────────────────────────

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY",
  "₹": "INR", "₽": "RUB", "₩": "KRW", "₺": "TRY",
  "zł": "PLN", "zl": "PLN", "kr": "SEK", "Kč": "CZK",
  "Ft": "HUF", "R$": "BRL", "A$": "AUD", "C$": "CAD",
  "CHF": "CHF", "NZ$": "NZD",
};

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

// ── Amount normaliser ────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;

  // Both comma and dot present → determine which is thousands vs decimal
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot   = s.lastIndexOf(".");
    if (lastDot > lastComma) {
      // "1,500.00" → dot is decimal
      return parseFloat(s.replace(/,/g, "")) || null;
    } else {
      // "1.500,00" → comma is decimal
      return parseFloat(s.replace(/\./g, "").replace(",", ".")) || null;
    }
  }

  // Only comma present: "15,50" (European decimal) vs "1,500" (thousands)
  if (s.includes(",")) {
    const parts = s.split(",");
    const last = parts[parts.length - 1];
    if (last.length === 3 && parts.length > 1) {
      // "1,500" → thousands separator
      return parseFloat(s.replace(/,/g, "")) || null;
    }
    return parseFloat(s.replace(",", ".")) || null;
  }

  return parseFloat(s) || null;
}

// ── Notification text parser ─────────────────────────────────────────────────
// Handles many Apple Wallet / bank notification variants:
//   EN: "Spent £15.50 at Starbucks"
//       "You spent $12.99 at Spotify"
//       "Payment of €10.99 to Netflix"
//       "Apple Pay: $20.00 at Amazon"
//       "Transaction: 15.50 GBP at Costa"
//   PL: "Zapłacono 45,00 zł w Żabka"
//       "Transakcja: 15,50 PLN w Starbucks"
//       "Płatność 20,00 PLN u Amazon"

interface ParsedPayment {
  amount: number;
  currency: string;
  merchant: string;
}

function resolveSymbol(sym: string): string {
  return SYMBOL_TO_CODE[sym] ?? sym.toUpperCase();
}

function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s*\(.*?\)\s*/g, "")   // strip parenthetical notes
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,!]+$/, "")
    .trim();
}

export function parseWalletNotification(text: string): ParsedPayment | null {
  const t = text.trim();

  // Pattern group 1: symbolic currency prefix, optional code, "at/to/w/u" + merchant
  // e.g. "Spent £15.50 at Costa", "You spent $12.99 at Spotify"
  const patterns: RegExp[] = [
    // English: "spent/payment of/transaction" + optional symbol + amount + optional code + at/to + merchant
    /(?:(?:you\s+)?spent|payment\s+of|transaction:?)\s+([£$€¥₹₽₩₺]?\s*[\d.,]+)\s*([A-Z]{2,3})?\s+(?:at|to)\s+(.+)/i,
    // "Apple Pay:? [symbol]amount [CODE] at/to merchant"
    /apple\s*pay[:\s]+([£$€¥₹₽₩₺]?\s*[\d.,]+)\s*([A-Z]{2,3})?\s+(?:at|to)\s+(.+)/i,
    // Generic English: "[symbol]amount [CODE] at merchant"
    /([£$€¥₹₽₩₺][\d.,]+)\s*([A-Z]{2,3})?\s+(?:at|to)\s+(.+)/i,
    // "amount CODE at merchant" (no symbol)
    /([\d.,]+)\s+([A-Z]{2,3})\s+(?:at|to)\s+(.+)/i,
    // Polish: "Zapłacono/Transakcja/Płatność amount [zł/PLN/symbol] [w/u/w sklepie] merchant"
    /(?:zap.?a?cono|transakcja[:\s]*|p.?atno.?[:\s]*)\s*([\d.,]+)\s*([A-Za-zł]{2,3})?\s+(?:w\s+sklepie\s+|w\s+|u\s+)(.+)/i,
    // Fallback: amount + known code + merchant (loose)
    /([\d.,]+)\s+([A-Z]{2,3})\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (!m) continue;

    const [, rawAmount, rawCode, rawMerchant] = m;

    // Strip leading symbol from rawAmount if present
    const amountStr = rawAmount.replace(/^[£$€¥₹₽₩₺\s]+/, "");
    const amount = parseAmount(amountStr);
    if (!amount || amount <= 0) continue;

    // Determine currency
    let currency = "USD";
    const leadingSymbol = rawAmount.match(/^([£$€¥₹₽₩₺]+)/)?.[1];
    if (rawCode && CURRENCY_CODE_RE.test(rawCode.toUpperCase())) {
      currency = rawCode.toUpperCase();
    } else if (leadingSymbol) {
      currency = resolveSymbol(leadingSymbol);
    } else if (rawCode) {
      currency = resolveSymbol(rawCode);
    }

    const merchant = cleanMerchant(rawMerchant ?? "");
    if (!merchant) continue;

    return { amount, currency, merchant };
  }

  // Last-ditch: try to find any number and treat rest as merchant
  const loose = t.match(/([£$€¥₹₽₩₺]?[\d.,]+)\s*([A-Z]{2,3})?\s+(.{3,})/);
  if (loose) {
    const amount = parseAmount(loose[1].replace(/^[£$€¥₹₽₩₺]/, ""));
    if (amount && amount > 0) {
      const currency = loose[2] && CURRENCY_CODE_RE.test(loose[2]) ? loose[2] : "USD";
      const merchant = cleanMerchant(loose[3] ?? "");
      if (merchant) return { amount, currency, merchant };
    }
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function enrichTx(tx: any, user: any) {
  return {
    id: tx.id,
    amount: parseFloat(tx.amount),
    description: tx.description,
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    date: tx.date,
    paymentMethod: tx.paymentMethod,
    receiptImage: null,
    userId: tx.userId,
    householdId: tx.householdId,
    userName: user?.name ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}

function getWebhookUrl(req: any) {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  const host  = (req.headers["x-forwarded-host"] as string) ?? req.get("host") ?? "";
  return `${proto}://${host}/api/wallet/ingest`;
}

// ── GET /wallet/token ────────────────────────────────────────────────────────

router.get("/wallet/token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let token = user.webhookToken;
  if (!token) {
    token = randomBytes(32).toString("hex");
    await db.update(usersTable).set({ webhookToken: token }).where(eq(usersTable.id, userId));
  }

  res.json({ token, webhookUrl: getWebhookUrl(req) });
});

// ── POST /wallet/token  (regenerate) ────────────────────────────────────────

router.post("/wallet/token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const token = randomBytes(32).toString("hex");
  await db.update(usersTable).set({ webhookToken: token }).where(eq(usersTable.id, userId));

  res.json({ token, webhookUrl: getWebhookUrl(req) });
});

// ── POST /wallet/ingest ──────────────────────────────────────────────────────

router.post("/wallet/ingest", async (req, res): Promise<void> => {
  const { token, text } = req.body as { token?: string; text?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" }); return;
  }
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.webhookToken, token));
  if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

  const parsed = parseWalletNotification(text);
  if (!parsed) {
    res.status(400).json({ error: "Could not parse notification text", raw: text }); return;
  }

  const today = new Date().toISOString().split("T")[0];

  const [tx] = await db.insert(transactionsTable).values({
    amount: String(parsed.amount),
    description: parsed.merchant,
    date: today,
    paymentMethod: "apple_pay",
    userId: user.id,
    householdId: user.householdId ?? null,
    categoryId: null,
  }).returning();

  res.status(201).json(enrichTx(tx, user));
});

export default router;
