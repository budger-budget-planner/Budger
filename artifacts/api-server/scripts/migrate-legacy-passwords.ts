/**
 * One-time migration: set passwordHash = bcrypt("1111") for legacy users who have no password.
 * Run with: pnpm --filter @workspace/api-server tsx scripts/migrate-legacy-passwords.ts
 */
import bcryptjs from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { isNull } from "drizzle-orm";

const LEGACY_PASSWORD = "1111";

async function run() {
  const hash = await bcryptjs.hash(LEGACY_PASSWORD, 10);

  const legacy = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(isNull(usersTable.passwordHash));

  if (legacy.length === 0) {
    console.log("No legacy users found — nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${legacy.length} legacy user(s) without a password:`);
  legacy.forEach(u => console.log(`  id=${u.id}  email=${u.email}`));

  for (const user of legacy) {
    await db
      .update(usersTable)
      .set({ passwordHash: hash })
      .where(isNull(usersTable.passwordHash));
  }

  console.log(`\nDone. Set password to "${LEGACY_PASSWORD}" for ${legacy.length} user(s).`);
  process.exit(0);
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
