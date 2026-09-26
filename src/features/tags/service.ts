/**
 * Tag service: per-user tags (built-in + custom). Built-ins are seeded by
 * `src/features/onboarding/service.ts` and are name/kind-immutable; custom
 * tags are fully user-owned. See docs/SPEC.md, section "Complexity & tags".
 */

import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import { tags as tagsTable, timingEntryTags } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";

export interface Tag {
  id: string;
  name: string;
  builtIn: boolean;
  excludeFromBenchmark: boolean;
}

function toTag(row: typeof tagsTable.$inferSelect): Tag {
  return {
    id: row.id,
    name: row.name,
    builtIn: row.builtIn,
    excludeFromBenchmark: row.excludeFromBenchmark,
  };
}

export async function listTags(db: DbClient, userId: string): Promise<Tag[]> {
  const rows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId))
    .orderBy(tagsTable.builtIn, tagsTable.name);
  return rows.map(toTag);
}

async function getOwnedTag(
  db: DbClient,
  userId: string,
  tagId: string,
): Promise<typeof tagsTable.$inferSelect> {
  const rows = await db
    .select()
    .from(tagsTable)
    .where(and(eq(tagsTable.id, tagId), eq(tagsTable.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Tag not found");
  return row;
}

export async function createTag(
  db: DbClient,
  userId: string,
  input: { name: string; excludeFromBenchmark?: boolean },
): Promise<Tag> {
  const rows = await db
    .insert(tagsTable)
    .values({
      userId,
      name: input.name,
      builtIn: false,
      excludeFromBenchmark: input.excludeFromBenchmark ?? false,
    })
    .returning();
  return toTag(rows[0]);
}

/**
 * Renames and/or changes exclude_from_benchmark for a custom tag. Built-in
 * tags' name is immutable; their exclude flag is fixed true per SPEC, so
 * only custom tags accept either field here.
 */
export async function updateTag(
  db: DbClient,
  userId: string,
  tagId: string,
  input: { name?: string; excludeFromBenchmark?: boolean },
): Promise<Tag> {
  const existing = await getOwnedTag(db, userId, tagId);
  if (existing.builtIn) {
    throw new ValidationError("Built-in tags cannot be edited");
  }

  const rows = await db
    .update(tagsTable)
    .set(input)
    .where(and(eq(tagsTable.id, tagId), eq(tagsTable.userId, userId)))
    .returning();
  return toTag(rows[0]);
}

export async function deleteTag(
  db: DbClient,
  userId: string,
  tagId: string,
): Promise<void> {
  const existing = await getOwnedTag(db, userId, tagId);
  if (existing.builtIn) {
    throw new ValidationError("Built-in tags cannot be deleted");
  }

  await db
    .delete(tagsTable)
    .where(and(eq(tagsTable.id, tagId), eq(tagsTable.userId, userId)));
}

/** Verifies every id in `tagIds` is a tag owned by `userId`. Throws
 * `NotFoundError` on the first id that isn't. */
export async function assertOwnsTags(
  db: DbClient,
  userId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const rows = await db
    .select({ id: tagsTable.id })
    .from(tagsTable)
    .where(and(eq(tagsTable.userId, userId)));
  const owned = new Set(rows.map((r) => r.id));
  for (const id of tagIds) {
    if (!owned.has(id)) throw new NotFoundError("Tag not found");
  }
}

export { timingEntryTags };
