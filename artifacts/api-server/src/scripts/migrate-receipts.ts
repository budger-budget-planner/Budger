/**
 * One-time migration: moves base64 receipt images stored in the
 * transactions.receiptImage column into object storage.
 *
 * Safe to run multiple times — rows that already have an objectPath
 * (value starts with "/objects/") are skipped.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server tsx src/scripts/migrate-receipts.ts
 */

import { db, transactionsTable } from "@workspace/db";
import { isNotNull, not, like, eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

async function main() {
  const storage = new ObjectStorageService();

  // Only rows with a base64 data URL (starts with "data:")
  const rows = await db
    .select({ id: transactionsTable.id, receiptImage: transactionsTable.receiptImage })
    .from(transactionsTable)
    .where(
      not(like(transactionsTable.receiptImage!, "/objects/%"))
    );

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
      const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const tmpPath = path.join(os.tmpdir(), `receipt-${crypto.randomUUID()}.${ext}`);

      // Write to a temp file so we can get a GCS upload URL
      await fs.writeFile(tmpPath, buffer);

      // Get presigned URL
      const uploadUrl = await storage.getObjectEntityUploadURL();

      // Upload directly to GCS
      const file = new File([buffer], `receipt.${ext}`, { type: contentType });
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!putRes.ok) throw new Error(`GCS PUT failed: ${putRes.status}`);

      // Normalise to objectPath
      const objectPath = storage.normalizeObjectEntityPath(uploadUrl.split("?")[0]);

      // Update the row
      await db
        .update(transactionsTable)
        .set({ receiptImage: objectPath })
        .where(eq(transactionsTable.id, row.id));

      await fs.unlink(tmpPath).catch(() => {});
      console.log(`  ✓ ${row.id} → ${objectPath}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
