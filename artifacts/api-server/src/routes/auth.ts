import { Router, type IRouter } from "express";
import bcryptjs from "bcryptjs";
import { db, usersTable, householdMembersTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import {
  LoginBody,
  LoginResponse,
  RegisterBody,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isChild(role: string) { return role === "child" || role === "member"; }

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    ...user,
    // numeric columns come back as strings from Drizzle — convert for API consumers
    totalBudget: user.totalBudget != null ? parseFloat(user.totalBudget) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

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

// POST /auth/register — create a new account
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, email, password } = parsed.data;

  // Check if email already taken
  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  // Determine golden/normal status
  const [{ total }] = await db.select({ total: count() }).from(usersTable);
  const status = total < 100 ? "golden" : "normal";

  const passwordHash = await bcryptjs.hash(password, 10);
  const name = `${firstName} ${lastName}`;

  const [user] = await db.insert(usersTable).values({
    name,
    firstName,
    lastName,
    email,
    passwordHash,
    status,
    firstLoginDone: false,
  }).returning();

  (req.session as any).userId = user.id;
  res.status(201).json(LoginResponse.parse(serializeUser(user)));
});

// POST /auth/login — authenticate with email + password
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

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

  // Capture original firstLoginDone BEFORE updating, so client can detect first login
  const wasFirstLogin = !user.firstLoginDone;

  // Mark first login done
  if (wasFirstLogin) {
    await db.update(usersTable)
      .set({ firstLoginDone: true })
      .where(eq(usersTable.id, user.id));
  }

  (req.session as any).userId = user.id;
  // Return original value (false = first login, true = returning user) so frontend can trigger onboarding
  res.json(LoginResponse.parse(serializeUser(user)));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;
