import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  greatLarderBucketsTable,
  householdsTable,
  larderBucketsTable,
  usersTable,
} from "../db";

export const DEFAULT_BUCKETS = [
  { key: "soft_savings", name: "Soft Savings", sortOrder: 0 },
  { key: "hard_savings", name: "Hard Savings", sortOrder: 1 },
  { key: "investments", name: "Investments", sortOrder: 2 },
] as const;

export const MAX_CUSTOM_BUCKETS = 3;

export type BucketDefinition = {
  key: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
};

export class BucketDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BucketDefinitionError";
  }
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new BucketDefinitionError("Bucket name is required");
  }
  const name = value.trim();
  if (!name) throw new BucketDefinitionError("Bucket name is required");
  if (name.length > 40) throw new BucketDefinitionError("Bucket name must be 40 characters or fewer");
  return name;
}

function toDefinition(row: {
  bucketKey: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
}): BucketDefinition {
  return {
    key: row.bucketKey,
    name: row.name,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
  };
}

export async function ensurePersonalBuckets(userId: number): Promise<void> {
  await db.insert(larderBucketsTable).values(
    DEFAULT_BUCKETS.map(bucket => ({
      userId,
      bucketKey: bucket.key,
      name: bucket.name,
      sortOrder: bucket.sortOrder,
      isDefault: true,
    })),
  ).onConflictDoNothing();
}

export async function ensureGreatLarderBuckets(householdId: number): Promise<void> {
  await db.insert(greatLarderBucketsTable).values(
    DEFAULT_BUCKETS.map(bucket => ({
      householdId,
      bucketKey: bucket.key,
      name: bucket.name,
      sortOrder: bucket.sortOrder,
      isDefault: true,
    })),
  ).onConflictDoNothing();
}

export async function getPersonalBuckets(userId: number): Promise<BucketDefinition[]> {
  await ensurePersonalBuckets(userId);
  const rows = await db.select().from(larderBucketsTable)
    .where(eq(larderBucketsTable.userId, userId))
    .orderBy(asc(larderBucketsTable.sortOrder), asc(larderBucketsTable.id));
  return rows.map(toDefinition);
}

export async function getGreatLarderBuckets(householdId: number): Promise<BucketDefinition[]> {
  await ensureGreatLarderBuckets(householdId);
  const rows = await db.select().from(greatLarderBucketsTable)
    .where(eq(greatLarderBucketsTable.householdId, householdId))
    .orderBy(asc(greatLarderBucketsTable.sortOrder), asc(greatLarderBucketsTable.id));
  return rows.map(toDefinition);
}

export async function personalBucketExists(userId: number, key: string): Promise<boolean> {
  await ensurePersonalBuckets(userId);
  const [row] = await db.select({ id: larderBucketsTable.id }).from(larderBucketsTable).where(and(
    eq(larderBucketsTable.userId, userId),
    eq(larderBucketsTable.bucketKey, key),
  ));
  return !!row;
}

export async function greatLarderBucketExists(householdId: number, key: string): Promise<boolean> {
  await ensureGreatLarderBuckets(householdId);
  const [row] = await db.select({ id: greatLarderBucketsTable.id }).from(greatLarderBucketsTable).where(and(
    eq(greatLarderBucketsTable.householdId, householdId),
    eq(greatLarderBucketsTable.bucketKey, key),
  ));
  return !!row;
}

export async function createPersonalBucket(userId: number, rawName: unknown): Promise<BucketDefinition> {
  const name = normalizeName(rawName);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    await tx.insert(larderBucketsTable).values(
      DEFAULT_BUCKETS.map(bucket => ({
        userId,
        bucketKey: bucket.key,
        name: bucket.name,
        sortOrder: bucket.sortOrder,
        isDefault: true,
      })),
    ).onConflictDoNothing();

    const existing = await tx.select().from(larderBucketsTable)
      .where(eq(larderBucketsTable.userId, userId));
    if (existing.filter(bucket => !bucket.isDefault).length >= MAX_CUSTOM_BUCKETS) {
      throw new BucketDefinitionError(`You can create up to ${MAX_CUSTOM_BUCKETS} custom buckets`);
    }
    if (existing.some(bucket => bucket.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new BucketDefinitionError("A bucket with that name already exists");
    }

    const maxSortOrder = existing.reduce((max, bucket) => Math.max(max, bucket.sortOrder), 2);
    const [created] = await tx.insert(larderBucketsTable).values({
      userId,
      bucketKey: `custom_${randomUUID()}`,
      name,
      sortOrder: maxSortOrder + 1,
      isDefault: false,
    }).returning();
    if (!created) throw new Error("Bucket was not created");
    return toDefinition(created);
  });
}

export async function createGreatLarderBucket(householdId: number, rawName: unknown): Promise<BucketDefinition> {
  const name = normalizeName(rawName);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM households WHERE id = ${householdId} FOR UPDATE`);
    await tx.insert(greatLarderBucketsTable).values(
      DEFAULT_BUCKETS.map(bucket => ({
        householdId,
        bucketKey: bucket.key,
        name: bucket.name,
        sortOrder: bucket.sortOrder,
        isDefault: true,
      })),
    ).onConflictDoNothing();

    const existing = await tx.select().from(greatLarderBucketsTable)
      .where(eq(greatLarderBucketsTable.householdId, householdId));
    if (existing.filter(bucket => !bucket.isDefault).length >= MAX_CUSTOM_BUCKETS) {
      throw new BucketDefinitionError(`You can create up to ${MAX_CUSTOM_BUCKETS} custom buckets`);
    }
    if (existing.some(bucket => bucket.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new BucketDefinitionError("A bucket with that name already exists");
    }

    const maxSortOrder = existing.reduce((max, bucket) => Math.max(max, bucket.sortOrder), 2);
    const [created] = await tx.insert(greatLarderBucketsTable).values({
      householdId,
      bucketKey: `custom_${randomUUID()}`,
      name,
      sortOrder: maxSortOrder + 1,
      isDefault: false,
    }).returning();
    if (!created) throw new Error("Bucket was not created");
    return toDefinition(created);
  });
}

export async function renamePersonalBucket(
  userId: number,
  key: string,
  rawName: unknown,
): Promise<BucketDefinition | null> {
  const name = normalizeName(rawName);
  const [existing] = await db.select().from(larderBucketsTable).where(and(
    eq(larderBucketsTable.userId, userId),
    eq(larderBucketsTable.bucketKey, key),
  ));
  if (!existing) return null;

  const duplicate = await db.select({ id: larderBucketsTable.id }).from(larderBucketsTable).where(and(
    eq(larderBucketsTable.userId, userId),
    eq(larderBucketsTable.bucketKey, key),
  ));
  if (!duplicate.length) return null;

  const all = await db.select().from(larderBucketsTable).where(eq(larderBucketsTable.userId, userId));
  if (all.some(bucket => bucket.bucketKey !== key && bucket.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new BucketDefinitionError("A bucket with that name already exists");
  }

  const [updated] = await db.update(larderBucketsTable)
    .set({ name })
    .where(and(eq(larderBucketsTable.userId, userId), eq(larderBucketsTable.bucketKey, key)))
    .returning();
  return updated ? toDefinition(updated) : null;
}

export async function renameGreatLarderBucket(
  householdId: number,
  key: string,
  rawName: unknown,
): Promise<BucketDefinition | null> {
  const name = normalizeName(rawName);
  const [existing] = await db.select().from(greatLarderBucketsTable).where(and(
    eq(greatLarderBucketsTable.householdId, householdId),
    eq(greatLarderBucketsTable.bucketKey, key),
  ));
  if (!existing) return null;

  const all = await db.select().from(greatLarderBucketsTable).where(eq(greatLarderBucketsTable.householdId, householdId));
  if (all.some(bucket => bucket.bucketKey !== key && bucket.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new BucketDefinitionError("A bucket with that name already exists");
  }

  const [updated] = await db.update(greatLarderBucketsTable)
    .set({ name })
    .where(and(eq(greatLarderBucketsTable.householdId, householdId), eq(greatLarderBucketsTable.bucketKey, key)))
    .returning();
  return updated ? toDefinition(updated) : null;
}