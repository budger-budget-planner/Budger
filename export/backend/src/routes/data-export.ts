/**
 * GDPR / App Store data export endpoint.
 *
 * Apple App Store Review Guidelines §5.1.1 and GDPR Art. 20 require that
 * users can receive a copy of all personal data the app holds about them.
 *
 * GET /api/user/export
 *   Returns a JSON file containing all data tied to the authenticated user:
 *   profile, transactions, categories, goals, recurring payments, larder,
 *   household membership, and notification preferences.
 *   The response is served as a downloadable .json attachment.
 *
 * Authentication: session cookie (same as all other authenticated routes).
 * Rate-limited by the global API limiter in app.ts.
 */

import { Router } from "express";
import { db } from "../db";
import {
  usersTable,
  transactionsTable,
  categoriesTable,
  goalsTable,
  recurringPaymentsTable,
  larderEntriesTable,
  householdsTable,
  householdMembersTable,
  pushSubscriptionsTable,
} from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/user/export", async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const userId = req.session.userId as number;

  try {
    // Fetch all data belonging to this user in parallel.
    const [
      [user],
      transactions,
      categories,
      goals,
      recurringPayments,
      larderEntries,
      householdMemberships,
      pushSubscriptions,
    ] = await Promise.all([
      db.select({
        id:        usersTable.id,
        email:     usersTable.email,
        firstName: usersTable.firstName,
        lastName:  usersTable.lastName,
        createdAt: usersTable.createdAt,
      }).from(usersTable).where(eq(usersTable.id, userId)),

      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
      db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId)),
      db.select().from(larderEntriesTable).where(eq(larderEntriesTable.userId, userId)),

      // Household memberships — join to get household name.
      db.select({
        householdId:   householdMembersTable.householdId,
        role:          householdMembersTable.role,
        joinedAt:      householdMembersTable.createdAt,
        householdName: householdsTable.name,
      })
        .from(householdMembersTable)
        .leftJoin(householdsTable, eq(householdMembersTable.householdId, householdsTable.id))
        .where(eq(householdMembersTable.userId, userId)),

      // Push tokens — export the fact that they exist but not the raw token
      // value (it is a device identifier that changes over time and has no
      // value to the user).
      db.select({
        platform:  pushSubscriptionsTable.platform,
        createdAt: pushSubscriptionsTable.createdAt,
      }).from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId)),
    ]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      notice:
        "This file contains all personal data Budger holds about your account. " +
        "To request permanent deletion, use Settings → Account → Delete my account " +
        "or email Budger.support@gmail.com.",
      profile: user,
      transactions,
      categories,
      goals,
      recurringPayments,
      larderEntries,
      householdMemberships,
      pushNotificationDevices: pushSubscriptions,
    };

    const filename = `budger-data-export-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Never allow an authenticated user's export to be cached and replayed
    // across accounts by a browser, proxy, or service worker.
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Cookie");
    res.status(200).json(exportPayload);
  } catch (err) {
    console.error("[data-export] Error exporting user data:", err);
    res.status(500).json({ error: "Failed to export data. Please try again later." });
  }
});

export default router;
