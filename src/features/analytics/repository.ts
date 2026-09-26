/**
 * Loads `CaseRecord[]` from Postgres for the pure analytics engine
 * (`src/features/analytics/engine.ts`). This is the only I/O boundary
 * between the DB and the engine — keep the engine itself dependency-free.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db";
import { tags as tagsTable, timingEntries, timingEntryTags } from "@/db/schema";
import type { CaseRecord } from "./types";

export interface LoadUserCasesOptions {
  studyTypeId?: string;
}

/**
 * All of a user's COMPLETED timing entries (with `finished_at` and
 * `active_duration_ms` set), as analytics `CaseRecord`s. `excluded` is true
 * iff at least one attached tag has `exclude_from_benchmark = true`.
 */
export async function loadUserCases(
  db: DbClient,
  userId: string,
  options: LoadUserCasesOptions = {},
): Promise<CaseRecord[]> {
  const conditions = [
    eq(timingEntries.userId, userId),
    eq(timingEntries.status, "COMPLETED"),
  ];
  if (options.studyTypeId) {
    conditions.push(eq(timingEntries.studyTypeId, options.studyTypeId));
  }

  const entryRows = await db
    .select()
    .from(timingEntries)
    .where(and(...conditions));

  const completed = entryRows.filter(
    (r) => r.finishedAt != null && r.activeDurationMs != null,
  );
  if (completed.length === 0) return [];

  const entryIds = completed.map((r) => r.id);
  const tagRows = await db
    .select({
      timingEntryId: timingEntryTags.timingEntryId,
      tagId: timingEntryTags.tagId,
      excludeFromBenchmark: tagsTable.excludeFromBenchmark,
    })
    .from(timingEntryTags)
    .innerJoin(tagsTable, eq(timingEntryTags.tagId, tagsTable.id))
    .where(inArray(timingEntryTags.timingEntryId, entryIds));

  const tagsByEntry = new Map<
    string,
    { tagIds: string[]; excluded: boolean }
  >();
  for (const row of tagRows) {
    let info = tagsByEntry.get(row.timingEntryId);
    if (!info) {
      info = { tagIds: [], excluded: false };
      tagsByEntry.set(row.timingEntryId, info);
    }
    info.tagIds.push(row.tagId);
    if (row.excludeFromBenchmark) info.excluded = true;
  }

  return completed.map((r) => {
    const info = tagsByEntry.get(r.id);
    return {
      id: r.id,
      studyTypeId: r.studyTypeId,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt as Date,
      activeDurationMs: r.activeDurationMs as number,
      complexity: r.complexity,
      excluded: info?.excluded ?? false,
      tagIds: info?.tagIds ?? [],
    };
  });
}
