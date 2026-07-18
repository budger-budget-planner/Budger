import { Router, type IRouter } from "express";
import { db, invitesTable, householdsTable, usersTable, householdMembersTable, notificationItemsTable } from "../db";
import { eq, and, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcryptjs from "bcryptjs";
import { pickNextColor } from "./households";
import {
  CreateInviteBody,
  AcceptInviteParams,
  GetInviteParams,
  CancelInviteParams,
} from "../api-zod";
import { sendHouseholdInviteEmail, sendHouseholdInviteNewUserEmail } from "../lib/email-sender";
import { getFrontendOrigin } from "../lib/frontend-origin";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function isHead(role: string) { return role === "head" || role === "owner"; }

function enrichInvite(invite: any, household: any, isRegistered?: boolean) {
  return {
    id: invite.id,
    email: invite.email,
    token: invite.token,
    householdId: invite.householdId,
    householdName: household?.name ?? null,
    role: invite.role ?? "child",
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    inviterName: invite.inviterName ?? null,
    ...(isRegistered !== undefined ? { isRegistered } : {}),
  };
}

/** Create a NC notification for the inviter. Silent — never throws. */
async function notifyInviter(inviterUserId: number, payload: {
  type: string;
  titleEn: string;
  titlePl: string;
  bodyEn: string;
  bodyPl: string;
  dedupKey?: string;
}) {
  try {
    await db.insert(notificationItemsTable).values({
      userId: inviterUserId,
      ...payload,
    }).onConflictDoNothing();
  } catch (err) {
    logger.warn({ err, inviterUserId }, "invites: failed to create NC notification for inviter");
  }
}

// POST /invites — create and email an invitation
router.post("/invites", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateInviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [inviterUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!inviterUser?.householdId) { res.status(400).json({ error: "You must be in a household to invite" }); return; }

  // Only head can invite
  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, inviterUser.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can invite members" }); return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role ?? "child";
  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, inviterUser.householdId));
  const householdName = household?.name ?? "your household";
  const inviterName = inviterUser.name ?? "Someone";
  const language = (inviterUser.language ?? "en") as "en" | "pl";

  // Look up whether the target email already exists as a fully registered user
  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  const isFullyRegistered = !!targetUser && !!targetUser.passwordHash && !targetUser.deletionScheduledAt;
  const isInHousehold = isFullyRegistered && !!targetUser.householdId;

  // Already in a household → notify inviter in NC, no email
  if (isInHousehold) {
    await notifyInviter(userId, {
      type: "invite_already_in_household",
      titleEn: "Invitation not sent",
      titlePl: "Zaproszenie nie zostało wysłane",
      bodyEn: `${email} is already a member of another household. No invitation was sent.`,
      bodyPl: `${email} jest już członkiem innego gospodarstwa. Zaproszenie nie zostało wysłane.`,
      dedupKey: `invite-blocked-${email}-${inviterUser.householdId}`,
    });
    res.status(422).json({ error: "USER_IN_HOUSEHOLD" });
    return;
  }

  // Check for an existing pending invite for this email+household to avoid duplicates
  const [existing] = await db.select().from(invitesTable)
    .where(and(
      eq(invitesTable.email, email),
      eq(invitesTable.householdId, inviterUser.householdId),
      eq(invitesTable.status, "pending"),
    ));
  if (existing && existing.expiresAt > new Date()) {
    // Resend email for existing pending invite instead of creating a new one
    const frontendOrigin = getFrontendOrigin(req);
    if (isFullyRegistered) {
      sendHouseholdInviteEmail({
        to: email,
        inviterName,
        householdName,
        acceptUrl: `${frontendOrigin}/invite/${existing.token}?action=accept`,
        declineUrl: `${frontendOrigin}/invite/${existing.token}?action=decline`,
        expiresAt: existing.expiresAt,
        language,
      }).catch(() => {});
    } else {
      sendHouseholdInviteNewUserEmail({
        to: email,
        inviterName,
        householdName,
        signupUrl: `${frontendOrigin}/invite/${existing.token}/signup`,
        expiresAt: existing.expiresAt,
        language,
      }).catch(() => {});
    }
    res.status(201).json(enrichInvite(existing, household));
    return;
  }

  // Create the invite
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db.insert(invitesTable).values({
    email,
    token,
    householdId: inviterUser.householdId,
    role,
    expiresAt,
    inviterUserId: userId,
    inviterName,
  }).returning();

  // Send the appropriate email
  const frontendOrigin = getFrontendOrigin(req);
  if (isFullyRegistered) {
    sendHouseholdInviteEmail({
      to: email,
      inviterName,
      householdName,
      acceptUrl: `${frontendOrigin}/invite/${token}?action=accept`,
      declineUrl: `${frontendOrigin}/invite/${token}?action=decline`,
      expiresAt,
      language,
    }).catch(err => logger.warn({ err, email }, "invites: failed to send registered invite email"));
  } else {
    sendHouseholdInviteNewUserEmail({
      to: email,
      inviterName,
      householdName,
      signupUrl: `${frontendOrigin}/invite/${token}/signup`,
      expiresAt,
      language,
    }).catch(err => logger.warn({ err, email }, "invites: failed to send new-user invite email"));
  }

  res.status(201).json(enrichInvite(invite, household));
});

// GET /invites — list pending invites for the caller's household (head view)
router.get("/invites", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.json([]); return; }

  const invites = await db.select().from(invitesTable)
    .where(and(eq(invitesTable.householdId, user.householdId), eq(invitesTable.status, "pending")));

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));

  res.json(invites.map(i => enrichInvite(i, household)));
});

// GET /invites/incoming — list active incoming invites for the caller's email
router.get("/invites/incoming", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.json([]); return; }

  const now = new Date();
  const invites = await db.select().from(invitesTable)
    .where(and(eq(invitesTable.email, user.email), eq(invitesTable.status, "pending")));

  const active = invites.filter(i => i.expiresAt > now);

  const results = await Promise.all(active.map(async invite => {
    const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
    return enrichInvite(invite, household, true);
  }));

  res.json(results);
});

// GET /invites/:token — fetch invite details (public, used by invite pages)
router.get("/invites/:token", async (req, res): Promise<void> => {
  const params = GetInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  if (invite.status === "cancelled") { res.status(410).json({ error: "REVOKED" }); return; }

  const isExpired = invite.status !== "pending" || invite.expiresAt < new Date();
  if (isExpired) {
    // On expiry, notify the inviter once (dedup prevents repeats)
    if (invite.inviterUserId) {
      notifyInviter(invite.inviterUserId, {
        type: "invite_expired",
        titleEn: "Invitation expired",
        titlePl: "Zaproszenie wygasło",
        bodyEn: `Your invitation to ${invite.email} expired without a response.`,
        bodyPl: `Twoje zaproszenie do ${invite.email} wygasło bez odpowiedzi.`,
        dedupKey: `invite-expired-${invite.token}`,
      });
    }
    res.status(410).json({ error: "EXPIRED" });
    return;
  }

  // Determine whether the invited email belongs to a registered user
  const [targetUser] = await db.select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable).where(eq(usersTable.email, invite.email));
  const isRegistered = !!targetUser?.passwordHash;

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  res.json(enrichInvite(invite, household, isRegistered));
});

// POST /invites/:token/accept — accept an invite (registered users)
router.post("/invites/:token/accept", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = AcceptInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    // Notify inviter of expiry if relevant
    if (invite && invite.inviterUserId && invite.expiresAt < new Date()) {
      notifyInviter(invite.inviterUserId, {
        type: "invite_expired",
        titleEn: "Invitation expired",
        titlePl: "Zaproszenie wygasło",
        bodyEn: `Your invitation to ${invite?.email} expired without a response.`,
        bodyPl: `Twoje zaproszenie do ${invite?.email} wygasło bez odpowiedzi.`,
        dedupKey: `invite-expired-${invite.token}`,
      });
    }
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  const [acceptingUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!acceptingUser || acceptingUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: "This invite was not sent to your account" });
    return;
  }

  await db.update(invitesTable).set({ status: "accepted" }).where(eq(invitesTable.id, invite.id));

  const existingMember = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, invite.householdId)));

  if (existingMember.length === 0) {
    const color = await pickNextColor(invite.householdId);
    await db.insert(householdMembersTable).values({
      userId,
      householdId: invite.householdId,
      role: invite.role ?? "child",
      memberColor: color,
    });
  }

  await db.update(usersTable).set({ householdId: invite.householdId }).where(eq(usersTable.id, userId));

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  if (!household) { res.status(404).json({ error: "Household not found" }); return; }

  // Notify inviter
  if (invite.inviterUserId) {
    notifyInviter(invite.inviterUserId, {
      type: "invite_accepted",
      titleEn: "Invitation accepted",
      titlePl: "Zaproszenie przyjęte",
      bodyEn: `${acceptingUser.name || invite.email} accepted your invitation and joined "${household.name}".`,
      bodyPl: `${acceptingUser.name || invite.email} przyjął(-ęła) zaproszenie i dołączył(-a) do "${household.name}".`,
      dedupKey: `invite-accepted-${invite.token}`,
    });
  }

  res.json({ ...household, createdAt: household.createdAt.toISOString() });
});

// POST /invites/:token/decline — decline an invite (registered users)
router.post("/invites/:token/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = CancelInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const [decliningUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!decliningUser || decliningUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: "This invite was not sent to your account" });
    return;
  }
  if (invite.status !== "pending" || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  await db.update(invitesTable).set({ status: "declined" }).where(eq(invitesTable.token, params.data.token));

  // Notify inviter
  if (invite.inviterUserId) {
    notifyInviter(invite.inviterUserId, {
      type: "invite_declined",
      titleEn: "Invitation declined",
      titlePl: "Zaproszenie odrzucone",
      bodyEn: `${decliningUser.name || invite.email} declined your household invitation.`,
      bodyPl: `${decliningUser.name || invite.email} odrzucił(-a) Twoje zaproszenie do gospodarstwa.`,
      dedupKey: `invite-declined-${invite.token}`,
    });
  }

  res.sendStatus(204);
});

// DELETE /invites/:token — revoke a pending invite (head only)
router.delete("/invites/:token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = CancelInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const [cancellingMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, invite.householdId)));
  if (!cancellingMembership || !isHead(cancellingMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can cancel this invite" });
    return;
  }

  await db.update(invitesTable).set({ status: "cancelled" }).where(eq(invitesTable.token, params.data.token));
  res.sendStatus(204);
});

// POST /invites/:token/register-start — bootstrap a new account for an unregistered invitee.
// Email is already verified by the fact they clicked the invite email link, so we set
// emailVerified=true and skip the normal verification step.  The frontend then proceeds
// directly to PIN setup (POST /auth/register) and onboarding.
router.post("/invites/:token/register-start", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { firstName, lastName } = req.body ?? {};

  if (!firstName?.trim() || !lastName?.trim()) {
    res.status(400).json({ error: "First name and last name are required" });
    return;
  }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token));
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    res.status(410).json({ error: "EXPIRED" });
    return;
  }

  // Verify email is not already a fully registered account
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, invite.email));
  if (existing?.passwordHash) {
    // Already registered — they should accept via the normal invite flow
    res.status(409).json({ error: "ALREADY_REGISTERED" });
    return;
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;
  const SIGNUP_TTL_MS = 15 * 60 * 1000; // 15 minutes to complete PIN setup
  const signupExpiresAt = new Date(Date.now() + SIGNUP_TTL_MS);

  let user;
  if (existing) {
    // Pending (unverified) account — refresh and mark email verified
    [user] = await db.update(usersTable)
      .set({
        name,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        signupExpiresAt,
        pendingInviteToken: token,
      })
      .where(eq(usersTable.id, existing.id))
      .returning();
  } else {
    // Determine golden/normal status
    const [{ total }] = await db.select({ total: count() }).from(usersTable);
    const status = total < 50 ? "golden" : "normal";

    [user] = await db.insert(usersTable).values({
      name,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: invite.email,
      status,
      emailVerified: true,   // validated by clicking the invite email
      firstLoginDone: false,
      signupExpiresAt,
      pendingInviteToken: token,
    }).returning();
  }

  res.json({ email: user.email, firstName: user.firstName, lastName: user.lastName });
});

export default router;
