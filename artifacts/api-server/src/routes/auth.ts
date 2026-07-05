import { Router, type IRouter } from "express";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, householdMembersTable } from "@workspace/db";
import { eq, and, count, isNull, lt } from "drizzle-orm";
import { sendVerificationEmail } from "../lib/email-sender";
import { logger } from "../lib/logger";
import {
  LoginBody,
  LoginResponse,
  RegisterBody,
  RegisterStartBody,
  RegisterStartResponse,
  VerifyEmailBody,
  VerifyEmailResponse,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
} from "@workspace/api-zod";

// Verification links expire after 30 minutes.
const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;

// The entire sign-up process (email submitted -> verified -> PIN set) must complete
// within this window, or the still-pending account row is deleted outright.
const SIGNUP_COMPLETION_TTL_MS = 15 * 60 * 1000;

const router: IRouter = Router();

// Deletes any pending (no passwordHash) account whose signup window has elapsed.
// Called lazily on the routes that touch pending accounts, plus on a periodic sweep
// below, so expired rows never linger even if nobody hits those routes again.
async function purgeExpiredPendingAccounts(): Promise<number> {
  const deleted = await db.delete(usersTable)
    .where(and(
      isNull(usersTable.passwordHash),
      lt(usersTable.signupExpiresAt, new Date()),
    ))
    .returning({ id: usersTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length, ids: deleted.map(d => d.id) }, "auth: purged expired unfinished sign-ups");
  }
  return deleted.length;
}

// Periodic sweep so abandoned sign-ups are cleaned up even without further requests.
setInterval(() => {
  purgeExpiredPendingAccounts().catch(err => logger.warn({ err }, "auth: periodic purge failed"));
}, 60 * 1000);

function isChild(role: string) { return role === "child" || role === "member"; }

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    ...user,
    // numeric columns come back as strings from Drizzle — convert for API consumers
    totalBudget: user.totalBudget != null ? parseFloat(user.totalBudget) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

// Lightweight in-process rate-limiter for check-email (no extra dependency needed).
// Allows 10 checks per IP per minute; resets the window on first hit.
const checkEmailBucket = new Map<string, { count: number; resetAt: number }>();
router.get("/auth/check-email", async (req, res): Promise<void> => {
  const ip = (req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const bucket = checkEmailBucket.get(ip);
  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= 10) { res.status(429).json({ error: "Too many requests" }); return; }
    bucket.count++;
  } else {
    checkEmailBucket.set(ip, { count: 1, resetAt: now + 60_000 });
  }
  const email = (req.query.email as string ?? "").toLowerCase().trim();
  if (!email) { res.status(400).json({ error: "Missing email" }); return; }
  const [user] = await db.select({ id: usersTable.id, pinLength: usersTable.pinLength, passwordHash: usersTable.passwordHash })
    .from(usersTable).where(eq(usersTable.email, email));
  // A pending account (no passwordHash) is treated as non-existent for login — the user
  // should re-register with the same email to set a new PIN.
  const fullyRegistered = !!user && !!user.passwordHash;
  res.json({ exists: fullyRegistered, pinLength: fullyRegistered ? (user?.pinLength ?? null) : null });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(serializeUser(user)));
});

router.patch("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Children cannot set their dashboard to private
  if (parsed.data.dashboardBlocked === true) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user?.householdId) {
      const [membership] = await db.select().from(householdMembersTable)
        .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
      if (membership && isChild(membership.role)) {
        res.status(403).json({ error: "Children cannot set their dashboard to private" });
        return;
      }
    }
  }

  // Drizzle's numeric column expects string | null, not number
  const dbData: Record<string, unknown> = { ...parsed.data };
  if ("totalBudget" in dbData && typeof dbData.totalBudget === "number") {
    dbData.totalBudget = String(dbData.totalBudget);
  }

  const [user] = await db.update(usersTable)
    .set(dbData as any)
    .where(eq(usersTable.id, userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UpdateMeResponse.parse(serializeUser(user)));
});

// POST /auth/register-start — collect account details and "send" a verification email.
// No password/PIN is set yet and no session is created — the account only becomes
// usable once the email link is confirmed and a PIN is chosen via /auth/register.
router.post("/auth/register-start", async (req, res): Promise<void> => {
  const parsed = RegisterStartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, email } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Clear out any other abandoned sign-ups before checking for a conflict, so a stale
  // row from a previous attempt never blocks this email from being reused.
  await purgeExpiredPendingAccounts();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing && existing.passwordHash) {
    // Fully-registered account already owns this email
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const name = `${firstName} ${lastName}`;
  const verificationToken = crypto.randomBytes(24).toString("hex");
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  // Starts (or restarts) the 15-minute clock for completing the whole sign-up flow.
  const signupExpiresAt = new Date(Date.now() + SIGNUP_COMPLETION_TTL_MS);

  let user;
  if (existing) {
    // Re-submitting the sign-up form for a still-pending (unverified) account —
    // refresh their details and issue a new token instead of erroring out.
    [user] = await db.update(usersTable)
      .set({ name, firstName, lastName, emailVerified: false, verificationToken, verificationTokenExpiresAt, signupExpiresAt })
      .where(eq(usersTable.id, existing.id))
      .returning();
  } else {
    // Determine golden/normal status at the moment the row is first created
    const [{ total }] = await db.select({ total: count() }).from(usersTable);
    const status = total < 50 ? "golden" : "normal";

    [user] = await db.insert(usersTable).values({
      name,
      firstName,
      lastName,
      email: normalizedEmail,
      status,
      firstLoginDone: false,
      emailVerified: false,
      verificationToken,
      verificationTokenExpiresAt,
      signupExpiresAt,
    }).returning();
  }

  // Build a fully-qualified link so it also works when clicked from a real inbox.
  const relativeVerifyPath = `/verify-email?token=${verificationToken}`;
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  const origin = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;
  const absoluteVerifyUrl = `${origin}${relativeVerifyPath}`;

  const sent = await sendVerificationEmail({ to: normalizedEmail, firstName, verifyUrl: absoluteVerifyUrl });
  if (sent) {
    req.log.info({ email: normalizedEmail }, "Verification email sent via Resend");
  } else {
    req.log.info({ email: normalizedEmail }, "Simulated verification email queued (Resend not sent)");
  }
  // Always also hand the frontend the relative link so it can show/simulate it in-app,
  // even when the real email was sent successfully.
  res.json(RegisterStartResponse.parse({ email: normalizedEmail, verifyUrl: relativeVerifyPath }));
});

// POST /auth/verify-email — confirm the token from the (simulated) verification email
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { token } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.verificationToken, token));
  if (!user || !user.verificationTokenExpiresAt || user.verificationTokenExpiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "This verification link is invalid or has expired" });
    return;
  }
  if (!user.passwordHash && user.signupExpiresAt && user.signupExpiresAt.getTime() < Date.now()) {
    // The 15-minute sign-up window elapsed — remove the row and make the user start over.
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
    res.status(410).json({ error: "Sign-up took too long and has expired. Please start again." });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(VerifyEmailResponse.parse({
    email: updated.email,
    firstName: updated.firstName ?? "",
    lastName: updated.lastName ?? "",
  }));
});

// POST /auth/register — finish account creation by setting a PIN, once the email is verified
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (!user) {
    res.status(404).json({ error: "No pending account found for this email" });
    return;
  }
  if (user.passwordHash) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({ error: "Please verify your email before setting a PIN" });
    return;
  }
  if (user.signupExpiresAt && user.signupExpiresAt.getTime() < Date.now()) {
    // The 15-minute sign-up window elapsed — remove the row and make the user start over.
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
    res.status(410).json({ error: "Sign-up took too long and has expired. Please start again." });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 10);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, pinLength: password.length })
    .where(eq(usersTable.id, user.id))
    .returning();

  (req.session as any).userId = updated.id;
  res.status(201).json(LoginResponse.parse(serializeUser(updated)));
});

// POST /auth/login — authenticate with email + password
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email: rawEmail, password } = parsed.data;
  const email = rawEmail.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: "No account found for this email" });
    return;
  }

  // Verify password — legacy users (no hash) cannot log in; they must register again
  if (!user.passwordHash) {
    res.status(401).json({ error: "No password set. Please create a new account." });
    return;
  }
  const ok = await bcryptjs.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  // Backfill pinLength for accounts registered before this field was added
  if (!user.pinLength) {
    await db.update(usersTable).set({ pinLength: password.length }).where(eq(usersTable.id, user.id));
  }

  (req.session as any).userId = user.id;
  // firstLoginDone: false means this is their first login — the client triggers onboarding.
  // We do NOT set firstLoginDone=true here; the Onboarding component does that once complete.
  // This prevents the /auth/me refetch (after queryClient.invalidateQueries) from returning
  // firstLoginDone:true before onboarding even runs, which was causing the language sync to
  // overwrite the user's locally-chosen language with the server's default "en".
  res.json(LoginResponse.parse(serializeUser(user)));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
