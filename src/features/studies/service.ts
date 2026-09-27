/**
 * Study type service: per-user CRUD, home-screen sections, and the
 * modality/region hierarchy used by the Studies/Browse screen. Every query
 * is scoped to `userId`; an id the caller does not own resolves as
 * `NotFoundError`, never leaking whether it belongs to someone else. See
 * docs/SPEC.md, sections "Study types" and "Home / Start screen".
 */

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  tags as tagsTable,
  timingEntries,
  timingEntryTags,
  userStudyTypes,
} from "@/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { MODALITY_ORDER, REGION_ORDER, type Modality } from "./templates";

export interface StudyType {
  id: string;
  modality: string;
  bodyRegion: string;
  name: string;
  shortName: string;
  sortOrder: number;
  favorite: boolean;
  createdFromTemplate: string | null;
  archivedAt: Date | null;
}

export interface StudyTypeRegionGroup {
  bodyRegion: string;
  studyTypes: StudyType[];
}

export interface StudyTypeModalityGroup {
  modality: string;
  regions: StudyTypeRegionGroup[];
}

export interface HomeSections {
  favorites: StudyType[];
  frequent: StudyType[];
  recent: StudyType[];
  all: StudyTypeModalityGroup[];
}

const FREQUENT_LIMIT = 8;
const RECENT_LIMIT = 3;

function toStudyType(row: typeof userStudyTypes.$inferSelect): StudyType {
  return {
    id: row.id,
    modality: row.modality,
    bodyRegion: row.bodyRegion,
    name: row.name,
    shortName: row.shortName,
    sortOrder: row.sortOrder,
    favorite: row.favorite,
    createdFromTemplate: row.createdFromTemplate,
    archivedAt: row.archivedAt,
  };
}

function regionRank(modality: string, region: string): number {
  const order = REGION_ORDER[modality as Modality];
  if (!order) return Number.MAX_SAFE_INTEGER;
  const idx = order.indexOf(region);
  return idx === -1 ? order.length : idx;
}

function modalityRank(modality: string): number {
  const idx = MODALITY_ORDER.indexOf(modality as Modality);
  return idx === -1 ? MODALITY_ORDER.length : idx;
}

function groupByModalityAndRegion(rows: StudyType[]): StudyTypeModalityGroup[] {
  const byModality = new Map<string, Map<string, StudyType[]>>();
  for (const row of rows) {
    let regions = byModality.get(row.modality);
    if (!regions) {
      regions = new Map();
      byModality.set(row.modality, regions);
    }
    let list = regions.get(row.bodyRegion);
    if (!list) {
      list = [];
      regions.set(row.bodyRegion, list);
    }
    list.push(row);
  }

  const modalities = [...byModality.keys()].sort(
    (a, b) => modalityRank(a) - modalityRank(b) || a.localeCompare(b),
  );

  return modalities.map((modality) => {
    const regions = byModality.get(modality)!;
    const regionNames = [...regions.keys()].sort(
      (a, b) =>
        regionRank(modality, a) - regionRank(modality, b) || a.localeCompare(b),
    );
    return {
      modality,
      regions: regionNames.map((bodyRegion) => ({
        bodyRegion,
        studyTypes: regions.get(bodyRegion)!,
      })),
    };
  });
}

/** All of a user's study types, ordered for the Browse hierarchy. */
export async function listStudyTypes(
  db: DbClient,
  userId: string,
): Promise<StudyType[]> {
  const rows = await db
    .select()
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId))
    .orderBy(userStudyTypes.sortOrder, userStudyTypes.name);
  return rows.map(toStudyType);
}

async function getOwnedStudyType(
  db: DbClient,
  userId: string,
  studyTypeId: string,
): Promise<typeof userStudyTypes.$inferSelect> {
  const rows = await db
    .select()
    .from(userStudyTypes)
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Study type not found");
  return row;
}

/**
 * Home screen sections: favorites, frequent (all-time COMPLETED count desc,
 * only >0, top 8), recent (last 3 distinct study types by most recent
 * `started_at`), and the full modality -> region -> study type hierarchy.
 */
export async function getHomeSections(
  db: DbClient,
  userId: string,
): Promise<HomeSections> {
  const allRows = await listStudyTypes(db, userId);
  // Archived study types are hidden everywhere on the Start screen
  // (favorites/frequent/recent/all/browse/search) — history and analytics
  // still see them via loadUserCases/listHistory, which don't call this.
  const all = allRows.filter((s) => s.archivedAt == null);
  const byId = new Map(all.map((s) => [s.id, s]));

  const favorites = all.filter((s) => s.favorite);

  const frequentRows = await db
    .select({
      studyTypeId: timingEntries.studyTypeId,
      completedCount: count(timingEntries.id),
    })
    .from(timingEntries)
    .where(
      and(
        eq(timingEntries.userId, userId),
        eq(timingEntries.status, "COMPLETED"),
      ),
    )
    .groupBy(timingEntries.studyTypeId)
    .orderBy(desc(count(timingEntries.id)))
    .limit(FREQUENT_LIMIT);

  const frequent = frequentRows
    .filter((r) => Number(r.completedCount) > 0)
    .map((r) => byId.get(r.studyTypeId))
    .filter((s): s is StudyType => s != null);

  const recentRows = await db
    .selectDistinctOn([timingEntries.studyTypeId], {
      studyTypeId: timingEntries.studyTypeId,
      startedAt: timingEntries.startedAt,
    })
    .from(timingEntries)
    .where(eq(timingEntries.userId, userId))
    .orderBy(timingEntries.studyTypeId, desc(timingEntries.startedAt));

  const recent = recentRows
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((r) => byId.get(r.studyTypeId))
    .filter((s): s is StudyType => s != null);

  return {
    favorites,
    frequent,
    recent,
    all: groupByModalityAndRegion(all),
  };
}

export interface CreateStudyTypeInput {
  modality: string;
  bodyRegion: string;
  name: string;
  shortName: string;
  favorite?: boolean;
}

export async function createStudyType(
  db: DbClient,
  userId: string,
  input: CreateStudyTypeInput,
): Promise<StudyType> {
  const maxSort = await db
    .select({
      max: sql<number>`coalesce(max(${userStudyTypes.sortOrder}), -1)`,
    })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const nextSort = (maxSort[0]?.max ?? -1) + 1;

  const rows = await db
    .insert(userStudyTypes)
    .values({
      userId,
      modality: input.modality,
      bodyRegion: input.bodyRegion,
      name: input.name,
      shortName: input.shortName,
      favorite: input.favorite ?? false,
      sortOrder: nextSort,
      createdFromTemplate: null,
    })
    .returning();
  return toStudyType(rows[0]);
}

export interface UpdateStudyTypeInput {
  name?: string;
  shortName?: string;
  modality?: string;
  bodyRegion?: string;
}

export async function updateStudyType(
  db: DbClient,
  userId: string,
  studyTypeId: string,
  input: UpdateStudyTypeInput,
): Promise<StudyType> {
  await getOwnedStudyType(db, userId, studyTypeId);

  const rows = await db
    .update(userStudyTypes)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .returning();
  return toStudyType(rows[0]);
}

export async function setFavorite(
  db: DbClient,
  userId: string,
  studyTypeId: string,
  favorite: boolean,
): Promise<StudyType> {
  const existing = await getOwnedStudyType(db, userId, studyTypeId);
  if (favorite && existing.archivedAt != null) {
    throw new ValidationError("Archived study types can't be favorited.");
  }
  const rows = await db
    .update(userStudyTypes)
    .set({ favorite, updatedAt: new Date() })
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .returning();
  return toStudyType(rows[0]);
}

/** Number of timing entries recorded against this study type. */
export async function countTimings(
  db: DbClient,
  userId: string,
  studyTypeId: string,
): Promise<number> {
  await getOwnedStudyType(db, userId, studyTypeId);
  const rows = await db
    .select({ value: count() })
    .from(timingEntries)
    .where(
      and(
        eq(timingEntries.studyTypeId, studyTypeId),
        eq(timingEntries.userId, userId),
      ),
    );
  return rows[0]?.value ?? 0;
}

/**
 * Deletes a study type outright. Only allowed when it has zero timing
 * entries — the `study_type_id` FK is `ON DELETE RESTRICT` precisely so
 * history can never be destroyed this way. A study type with timings must
 * be archived instead (see `archiveStudyType`).
 */
export async function deleteStudyType(
  db: DbClient,
  userId: string,
  studyTypeId: string,
): Promise<{ deletedTimingsCount: number }> {
  const deletedTimingsCount = await countTimings(db, userId, studyTypeId);
  if (deletedTimingsCount > 0) {
    throw new ValidationError(
      "This study type has recorded cases and can't be deleted. Archive it instead to hide it from Start while keeping your history.",
    );
  }

  const rows = await db
    .delete(userStudyTypes)
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .returning({ id: userStudyTypes.id });

  if (rows.length === 0) throw new NotFoundError("Study type not found");
  return { deletedTimingsCount };
}

/**
 * Archives a study type: hidden from the Start screen (favorites/frequent/
 * recent/all/browse/search) and can't be started or favorited, but its
 * history, analytics, export and import matching are all preserved. Also
 * clears `favorite`, since an archived study can't be a favorite.
 */
export async function archiveStudyType(
  db: DbClient,
  userId: string,
  studyTypeId: string,
): Promise<StudyType> {
  await getOwnedStudyType(db, userId, studyTypeId);
  const rows = await db
    .update(userStudyTypes)
    .set({ archivedAt: new Date(), favorite: false, updatedAt: new Date() })
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .returning();
  return toStudyType(rows[0]);
}

/** Restores an archived study type to active (visible on Start again). */
export async function unarchiveStudyType(
  db: DbClient,
  userId: string,
  studyTypeId: string,
): Promise<StudyType> {
  await getOwnedStudyType(db, userId, studyTypeId);
  const rows = await db
    .update(userStudyTypes)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .returning();
  return toStudyType(rows[0]);
}

/** Reassigns sort_order to match the given order. Ids not owned by the user
 * are ignored (defense in depth); ids omitted keep their relative order at
 * the end. */
export async function reorderStudyTypes(
  db: DbClient,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  const owned = await db
    .select({ id: userStudyTypes.id })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const ownedIds = new Set(owned.map((r) => r.id));

  const validOrdered = orderedIds.filter((id) => ownedIds.has(id));
  const remainder = [...ownedIds].filter((id) => !validOrdered.includes(id));
  const finalOrder = [...validOrdered, ...remainder];

  await db.transaction(async (tx) => {
    for (let i = 0; i < finalOrder.length; i++) {
      await tx
        .update(userStudyTypes)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(userStudyTypes.id, finalOrder[i]),
            eq(userStudyTypes.userId, userId),
          ),
        );
    }
  });
}

/** Ids of the user's tags that mark exclude_from_benchmark, for analytics. */
export async function loadExcludedTagIds(
  db: DbClient,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: tagsTable.id })
    .from(tagsTable)
    .where(
      and(
        eq(tagsTable.userId, userId),
        eq(tagsTable.excludeFromBenchmark, true),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Convenience export used by the timer/analytics services to check whether
 * a set of tag ids includes at least one exclude_from_benchmark tag. */
export async function tagsIncludeExcluded(
  db: DbClient,
  tagIds: string[],
): Promise<boolean> {
  if (tagIds.length === 0) return false;
  const rows = await db
    .select({ id: tagsTable.id })
    .from(tagsTable)
    .where(
      and(
        inArray(tagsTable.id, tagIds),
        eq(tagsTable.excludeFromBenchmark, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Re-exported so callers of this module don't also need to import from
// timingEntryTags directly for simple existence checks.
export { timingEntryTags };
