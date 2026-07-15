/**
 * One-time migration: moves base64 receipt images stored in the
 * transactions.receiptImage column into Supabase Storage.
 *
 * Safe to run multiple times — rows that already have a Supabase public URL
 * (value starts with "http") are skipped.
 *
 * Run with:
 *   pnpm tsx src/scripts/migrate-receipts.ts
 */

import { db, transactionsTable } from "../db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

async function main() {
  const storage = new ObjectStorageService();

  const rows = await db
    .select({ id: transactionsTable.id, receiptImage: transactionsTable.receiptImage })
    .from(transactionsTable);

  const base64Rows = rows.filter(r => r.receiptImage?.startsWith("data:"));
  console.log(`Found ${base64Rows.length} base64 receipts to migrate.`);

  let migrated = 0;
  let failed = 0;

  for (const row of base64Rows) {
    try {
      const dataUrl = row.receiptImage!;
      // Parse: data:<mime>;base64,<data>
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) { console.warn(`Row ${row.id}: unrecognised data URL format, skipping.`); failed++; continue; }

      const [, contentType, b64] = match;
      const buffer = Buffer.from(b64, "base64");

      const publicUrl = await storage.uploadObjectEntity(buffer, contentType);

      await db
        .update(transactionsTable)
        .set({ receiptImage: publicUrl })
        .where(eq(transactionsTable.id, row.id));

      console.log(`  \u2713 ${row.id} \u2192 ${publicUrl}`);
      migrated++;
    } catch (err) {
      console.error(`  \u2717 ${row.id}: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
