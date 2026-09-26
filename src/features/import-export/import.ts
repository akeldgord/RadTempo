/**
 * Import: parse an uploaded export archive, preview what it would do, and
 * apply it. See docs/SPEC.md, section "Export / import".
 *
 * Matching rules (never trust client-supplied ids across users):
 * - Study types: matched by id if owned by this user, else by
 *   (modality, body_region, lower(name)) among this user's own study
 *   types, else created fresh with a new random id.
 * - Tags: matched by id if owned by this user, else by lower(name) among
 *   this user's own tags (this also covers built-ins, which are matched to
 *   the user's already-seeded built-in tags by name), else created fresh.
 * - Timings: `timing_entries.id` is a global primary key, so an imported
 *   id can collide with a row owned by someone else. If the id already
 *   belongs to *this* user, the row is skipped (idempotent re-import). If
 *   it belongs to *another* user, a deterministic replacement id is
 *   derived (`uuidv5(userId, originalId)`) and checked again the same way,
 *   so re-importing the same bundle into the same account still dedupes.
 */

import { randomUUID } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  tags as tagsTable,
  timingEntries,
  timingEntryTags,
  timingPauseEvents,
  userPreferences,
  userStudyTypes,
} from "@/db/schema";
import { ensureUserDefaults } from "@/features/onboarding/service";
import { syncAchievements } from "@/features/achievements/service";
import { assertNotMaintenance } from "@/server/settings";
import { ValidationError } from "@/server/errors";
import {
  importBundleSchema,
  MAX_ZIP_BYTES,
  type ExportPreferences,
  type ExportStudyType,
  type ExportTag,
  type ImportBundle,
} from "./schema";
import { uuidv5 } from "./uuid";

export type ParseImportResult =
  { ok: true; bundle: ImportBundle } | { ok: false; error: string };

const REQUIRED_FILES = [
  "manifest.json",
  "profile.json",
  "study-types.json",
  "tags.json",
  "timings.json",
  "preferences.json",
] as const;

/**
 * Validates an uploaded export archive: size cap, well-formed zip, every
 * required JSON file present and parseable, and the whole bundle passes
 * `importBundleSchema` (uuid shapes, ISO datetimes, `finished_at >=
 * started_at`, `active_duration_ms` consistency, cross-references between
 * timings/study-types/tags, and the 200k-row cap). Never throws — a
 * malformed or tampered upload always comes back as `{ ok: false }`.
 */
export function parseImport(buffer: Buffer): ParseImportResult {
  if (buffer.byteLength > MAX_ZIP_BYTES) {
    return {
      ok: false,
      error: `Export file is too large (max ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB).`,
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buffer);
  } catch {
    return {
      ok: false,
      error: "Could not read the uploaded file as a zip archive.",
    };
  }

  const raw: Record<string, unknown> = {};
  for (const file of REQUIRED_FILES) {
    const bytes = unzipped[file];
    if (!bytes) {
      return { ok: false, error: `Missing ${file} in the export archive.` };
    }
    try {
      raw[file] = JSON.parse(strFromU8(bytes));
    } catch {
      return { ok: false, error: `Could not parse ${file} as JSON.` };
    }
  }

  const candidate = {
    manifest: raw["manifest.json"],
    profile: raw["profile.json"],
    studyTypes: raw["study-types.json"],
    tags: raw["tags.json"],
    timings: raw["timings.json"],
    preferences: raw["preferences.json"],
  };

  const parsed = importBundleSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return {
      ok: false,
      error: `The export file failed validation: ${issues.join("; ")}`,
    };
  }

  return { ok: true, bundle: parsed.data };
}

// ---------------------------------------------------------------------------
// Study type resolution
// ---------------------------------------------------------------------------

interface StudyTypeResolution {
  action: "matched" | "new";
  targetId: string;
}

function studyTypeKey(s: {
  modality: string;
  body_region: string;
  name: string;
}): string {
  return `${s.modality}\u0000${s.body_region}\u0000${s.name.toLowerCase()}`;
}

async function resolveStudyTypes(
  db: DbClient,
  userId: string,
  importedStudyTypes: ExportStudyType[],
): Promise<Map<string, StudyTypeResolution>> {
  const owned = await db
    .select({
      id: userStudyTypes.id,
      modality: userStudyTypes.modality,
      bodyRegion: userStudyTypes.bodyRegion,
      name: userStudyTypes.name,
    })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const ownedIds = new Set(owned.map((r) => r.id));
  const byKey = new Map(
    owned.map((r) => [
      studyTypeKey({
        modality: r.modality,
        body_region: r.bodyRegion,
        name: r.name,
      }),
      r.id,
    ]),
  );

  const result = new Map<string, StudyTypeResolution>();
  for (const st of importedStudyTypes) {
    if (ownedIds.has(st.id)) {
      result.set(st.id, { action: "matched", targetId: st.id });
      continue;
    }
    const key = studyTypeKey(st);
    const matchedId = byKey.get(key);
    if (matchedId) {
      result.set(st.id, { action: "matched", targetId: matchedId });
      continue;
    }
    // New within this import too: dedupe by key so two imported rows with
    // the same (modality, region, name) become one new study type.
    const newId = randomUUID();
    byKey.set(key, newId);
    result.set(st.id, { action: "new", targetId: newId });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tag resolution
// ---------------------------------------------------------------------------

interface TagResolution {
  action: "matched" | "new";
  targetId: string;
}

async function resolveTags(
  db: DbClient,
  userId: string,
  importedTags: ExportTag[],
): Promise<Map<string, TagResolution>> {
  const owned = await db
    .select({ id: tagsTable.id, name: tagsTable.name })
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId));
  const ownedIds = new Set(owned.map((r) => r.id));
  const byNameLower = new Map(owned.map((r) => [r.name.toLowerCase(), r.id]));

  const result = new Map<string, TagResolution>();
  for (const tag of importedTags) {
    if (ownedIds.has(tag.id)) {
      result.set(tag.id, { action: "matched", targetId: tag.id });
      continue;
    }
    const matchedId = byNameLower.get(tag.name.toLowerCase());
    if (matchedId) {
      result.set(tag.id, { action: "matched", targetId: matchedId });
      continue;
    }
    const newId = randomUUID();
    byNameLower.set(tag.name.toLowerCase(), newId);
    result.set(tag.id, { action: "new", targetId: newId });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Timing id resolution (see module doc comment for the algorithm)
// ---------------------------------------------------------------------------

interface TimingResolution {
  action: "create" | "skip";
  id: string;
}

const MAX_ID_REMAP_ATTEMPTS = 8;

async function resolveTimingIds(
  db: DbClient,
  userId: string,
  originalIds: string[],
): Promise<Map<string, TimingResolution>> {
  const result = new Map<string, TimingResolution>();
  let pending = new Map<string, string>(originalIds.map((id) => [id, id]));

  for (
    let attempt = 0;
    attempt < MAX_ID_REMAP_ATTEMPTS && pending.size > 0;
    attempt++
  ) {
    const candidates = [...new Set(pending.values())];
    const owners = await db
      .select({ id: timingEntries.id, userId: timingEntries.userId })
      .from(timingEntries)
      .where(inArray(timingEntries.id, candidates));
    const ownerByCandidate = new Map(owners.map((r) => [r.id, r.userId]));

    const stillPending = new Map<string, string>();
    for (const [originalId, candidate] of pending) {
      const owner = ownerByCandidate.get(candidate);
      if (owner === undefined) {
        result.set(originalId, { action: "create", id: candidate });
      } else if (owner === userId) {
        result.set(originalId, { action: "skip", id: candidate });
      } else {
        stillPending.set(originalId, uuidv5(userId, candidate));
      }
    }
    pending = stillPending;
  }

  // Practically unreachable (would require MAX_ID_REMAP_ATTEMPTS consecutive
  // hash collisions with other users' rows), but keep resolution total.
  for (const [originalId] of pending) {
    result.set(originalId, { action: "create", id: randomUUID() });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface ImportPreview {
  studyTypes: { new: number; matched: number };
  cases: { new: number; duplicate: number };
  tags: { new: number; matched: number };
  preferences: ExportPreferences;
}

function countActions<T extends { action: string }>(
  resolutions: Iterable<T>,
  newAction: string,
): { new: number; matched: number } {
  let created = 0;
  let matched = 0;
  for (const r of resolutions) {
    if (r.action === newAction) created++;
    else matched++;
  }
  return { new: created, matched };
}

/** Read-only: computes what `applyImport` would do, without writing
 * anything. Safe to call repeatedly (e.g. while the user reviews). */
export async function previewImport(
  db: DbClient,
  userId: string,
  bundle: ImportBundle,
): Promise<ImportPreview> {
  const studyTypeResolution = await resolveStudyTypes(
    db,
    userId,
    bundle.studyTypes,
  );
  const tagResolution = await resolveTags(db, userId, bundle.tags);
  const timingResolution = await resolveTimingIds(
    db,
    userId,
    bundle.timings.map((t) => t.id),
  );

  const studyTypesCount = countActions(studyTypeResolution.values(), "new");
  const tagsCount = countActions(tagResolution.values(), "new");

  let newCases = 0;
  let duplicateCases = 0;
  for (const r of timingResolution.values()) {
    if (r.action === "create") newCases++;
    else duplicateCases++;
  }

  return {
    studyTypes: studyTypesCount,
    tags: tagsCount,
    cases: { new: newCases, duplicate: duplicateCases },
    preferences: bundle.preferences,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyImportResult {
  studyTypes: { created: number; matched: number };
  cases: { created: number; skipped: number };
  tags: { created: number; matched: number };
  preferencesApplied: boolean;
}

export interface ApplyImportOptions {
  /** Only overwrite the user's stored preferences if they explicitly
   * opted in (the "Apply preferences too" checkbox). */
  applyPreferences: boolean;
}

/**
 * Applies a validated import bundle for `userId` in a single transaction.
 * Idempotent: re-applying the same bundle to the same account creates no
 * duplicate study types, tags, or timing entries. Runs `syncAchievements`
 * once the transaction commits.
 */
export async function applyImport(
  db: DbClient,
  userId: string,
  bundle: ImportBundle,
  options: ApplyImportOptions,
): Promise<ApplyImportResult> {
  await assertNotMaintenance();

  if (bundle.timings.length > 200_000) {
    throw new ValidationError("Import contains too many timing entries.");
  }

  const result = await db.transaction(async (tx) => {
    await ensureUserDefaults(tx, userId);

    const studyTypeResolution = await resolveStudyTypes(
      tx,
      userId,
      bundle.studyTypes,
    );
    const newStudyTypeRows = bundle.studyTypes.filter(
      (st) => studyTypeResolution.get(st.id)?.action === "new",
    );
    // Dedupe: several imported rows may resolve to the same new targetId.
    const seenStudyTypeTargets = new Set<string>();
    const studyTypeInserts = newStudyTypeRows.filter((st) => {
      const targetId = studyTypeResolution.get(st.id)!.targetId;
      if (seenStudyTypeTargets.has(targetId)) return false;
      seenStudyTypeTargets.add(targetId);
      return true;
    });
    if (studyTypeInserts.length > 0) {
      await tx.insert(userStudyTypes).values(
        studyTypeInserts.map((st) => ({
          id: studyTypeResolution.get(st.id)!.targetId,
          userId,
          modality: st.modality,
          bodyRegion: st.body_region,
          name: st.name,
          shortName: st.short_name,
          sortOrder: st.sort_order,
          favorite: st.favorite,
          createdFromTemplate: st.created_from_template,
          createdAt: new Date(st.created_at),
        })),
      );
    }

    const tagResolution = await resolveTags(tx, userId, bundle.tags);
    const newTagRows = bundle.tags.filter(
      (t) => tagResolution.get(t.id)?.action === "new",
    );
    const seenTagTargets = new Set<string>();
    const tagInserts = newTagRows.filter((t) => {
      const targetId = tagResolution.get(t.id)!.targetId;
      if (seenTagTargets.has(targetId)) return false;
      seenTagTargets.add(targetId);
      return true;
    });
    if (tagInserts.length > 0) {
      await tx.insert(tagsTable).values(
        tagInserts.map((t) => ({
          id: tagResolution.get(t.id)!.targetId,
          userId,
          name: t.name,
          // Built-in status follows the user's own tag set, not the
          // export: a name that doesn't already match one of the user's
          // built-ins is created as an ordinary custom tag.
          builtIn: false,
          excludeFromBenchmark: t.exclude_from_benchmark,
          createdAt: new Date(t.created_at),
        })),
      );
    }

    const timingResolution = await resolveTimingIds(
      tx,
      userId,
      bundle.timings.map((t) => t.id),
    );
    const toCreate = bundle.timings.filter(
      (t) => timingResolution.get(t.id)?.action === "create",
    );

    const now = new Date();
    if (toCreate.length > 0) {
      await tx.insert(timingEntries).values(
        toCreate.map((t) => {
          const targetStudyTypeId = studyTypeResolution.get(
            t.study_type_id,
          )?.targetId;
          if (!targetStudyTypeId) {
            throw new ValidationError(
              `Timing ${t.id} references a study type that could not be resolved.`,
            );
          }
          return {
            id: timingResolution.get(t.id)!.id,
            userId,
            studyTypeId: targetStudyTypeId,
            status: "COMPLETED" as const,
            startedAt: new Date(t.started_at),
            pausedDurationMs: t.paused_duration_ms,
            finishedAt: new Date(t.finished_at),
            activeDurationMs: t.active_duration_ms,
            complexity: t.complexity,
            classificationFinalizedAt: new Date(
              t.classification_finalized_at ?? t.finished_at,
            ),
            importedAt: now,
          };
        }),
      );

      const entryTagRows = toCreate.flatMap((t) => {
        const mappedTagIds = [
          ...new Set(
            t.tag_ids
              .map((tagId) => tagResolution.get(tagId)?.targetId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        return mappedTagIds.map((tagId) => ({
          timingEntryId: timingResolution.get(t.id)!.id,
          tagId,
        }));
      });
      if (entryTagRows.length > 0) {
        await tx.insert(timingEntryTags).values(entryTagRows);
      }

      const pauseEventRows = toCreate.flatMap((t) =>
        t.pause_events.map((pe) => ({
          timingEntryId: timingResolution.get(t.id)!.id,
          pausedAt: new Date(pe.paused_at),
          resumedAt: pe.resumed_at ? new Date(pe.resumed_at) : null,
        })),
      );
      if (pauseEventRows.length > 0) {
        await tx.insert(timingPauseEvents).values(pauseEventRows);
      }
    }

    let preferencesApplied = false;
    if (options.applyPreferences) {
      await tx
        .update(userPreferences)
        .set({
          theme: bundle.preferences.theme,
          timerVisibility: bundle.preferences.timer_visibility,
          keyboardShortcutsJson: bundle.preferences.keyboard_shortcuts,
          updatedAt: now,
        })
        .where(eq(userPreferences.userId, userId));
      preferencesApplied = true;
    }

    const studyTypeCounts = countActions(studyTypeResolution.values(), "new");
    const tagCounts = countActions(tagResolution.values(), "new");
    let createdCases = 0;
    let skippedCases = 0;
    for (const r of timingResolution.values()) {
      if (r.action === "create") createdCases++;
      else skippedCases++;
    }

    return {
      studyTypes: {
        created: studyTypeCounts.new,
        matched: studyTypeCounts.matched,
      },
      tags: { created: tagCounts.new, matched: tagCounts.matched },
      cases: { created: createdCases, skipped: skippedCases },
      preferencesApplied,
    };
  });

  await syncAchievements(db, userId);

  return result;
}
