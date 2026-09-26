/**
 * Builds a user's personal data export: a zip containing manifest.json,
 * profile.json, study-types.json, tags.json, timings.json, preferences.json,
 * and timings.csv. See docs/SPEC.md, section "Export / import".
 *
 * Only ever reads rows scoped to `userId`, and only ever includes fields
 * that are safe to hand back to the account owner — never password hashes,
 * session tokens, or any other user's data.
 */

import { zipSync, strToU8 } from "fflate";
import { asc, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  tags as tagsTable,
  timingEntries,
  timingEntryTags,
  timingPauseEvents,
  user as userTable,
  userPreferences,
  userStudyTypes,
} from "@/db/schema";
import { ensureUserDefaults } from "@/features/onboarding/service";
import { getAppVersion } from "@/features/admin/system";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportManifest,
  type ExportPauseEvent,
  type ExportPreferences,
  type ExportProfile,
  type ExportStudyType,
  type ExportTag,
  type ExportTiming,
} from "./schema";

function toIso(d: Date): string {
  return d.toISOString();
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface UserExportBundle {
  manifest: ExportManifest;
  profile: ExportProfile;
  studyTypes: ExportStudyType[];
  tags: ExportTag[];
  timings: ExportTiming[];
  preferences: ExportPreferences;
}

/**
 * Assembles everything a user export needs, scoped strictly to `userId`.
 * Only COMPLETED timing entries are included (SPEC: "No manual case
 * creation ever" combined with export/import round-tripping only ever
 * dealing in finished cases).
 */
export async function buildExportBundle(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<UserExportBundle> {
  await ensureUserDefaults(db, userId);

  const userRows = await db
    .select({
      name: userTable.name,
      email: userTable.email,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const userRow = userRows[0];
  if (!userRow) {
    throw new Error("User not found");
  }

  const studyTypeRows = await db
    .select()
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId))
    .orderBy(asc(userStudyTypes.sortOrder));

  const tagRows = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId))
    .orderBy(asc(tagsTable.createdAt));

  const entryRows = await db
    .select()
    .from(timingEntries)
    .where(eq(timingEntries.userId, userId));
  const completed = entryRows.filter(
    (r) =>
      r.status === "COMPLETED" &&
      r.finishedAt != null &&
      r.activeDurationMs != null,
  );

  const entryIds = completed.map((r) => r.id);

  const tagLinkRows =
    entryIds.length > 0
      ? await db
          .select({
            timingEntryId: timingEntryTags.timingEntryId,
            tagId: timingEntryTags.tagId,
          })
          .from(timingEntryTags)
          .where(inArray(timingEntryTags.timingEntryId, entryIds))
      : [];
  const tagIdsByEntry = new Map<string, string[]>();
  for (const row of tagLinkRows) {
    const list = tagIdsByEntry.get(row.timingEntryId);
    if (list) list.push(row.tagId);
    else tagIdsByEntry.set(row.timingEntryId, [row.tagId]);
  }

  const pauseEventRows =
    entryIds.length > 0
      ? await db
          .select()
          .from(timingPauseEvents)
          .where(inArray(timingPauseEvents.timingEntryId, entryIds))
      : [];
  const pauseEventsByEntry = new Map<string, ExportPauseEvent[]>();
  for (const row of pauseEventRows) {
    const event: ExportPauseEvent = {
      paused_at: toIso(row.pausedAt),
      resumed_at: row.resumedAt ? toIso(row.resumedAt) : null,
    };
    const list = pauseEventsByEntry.get(row.timingEntryId);
    if (list) list.push(event);
    else pauseEventsByEntry.set(row.timingEntryId, [event]);
  }

  const preferencesRows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const preferencesRow = preferencesRows[0];

  const manifest: ExportManifest = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    app_version: getAppVersion(),
    created_at: toIso(now),
    app: "radtempo",
  };

  const profile: ExportProfile = {
    name: userRow.name,
    email: userRow.email,
    created_at: toIso(userRow.createdAt),
  };

  const studyTypes: ExportStudyType[] = studyTypeRows.map((row) => ({
    id: row.id,
    modality: row.modality,
    body_region: row.bodyRegion,
    name: row.name,
    short_name: row.shortName,
    sort_order: row.sortOrder,
    favorite: row.favorite,
    created_from_template: row.createdFromTemplate,
    created_at: toIso(row.createdAt),
  }));

  const tags: ExportTag[] = tagRows.map((row) => ({
    id: row.id,
    name: row.name,
    built_in: row.builtIn,
    exclude_from_benchmark: row.excludeFromBenchmark,
    created_at: toIso(row.createdAt),
  }));

  const timings: ExportTiming[] = completed.map((row) => ({
    id: row.id,
    study_type_id: row.studyTypeId,
    status: "COMPLETED",
    started_at: toIso(row.startedAt),
    finished_at: toIso(row.finishedAt as Date),
    paused_duration_ms: row.pausedDurationMs,
    active_duration_ms: row.activeDurationMs as number,
    complexity: row.complexity,
    tag_ids: tagIdsByEntry.get(row.id) ?? [],
    classification_finalized_at: row.classificationFinalizedAt
      ? toIso(row.classificationFinalizedAt)
      : null,
    pause_events: pauseEventsByEntry.get(row.id) ?? [],
  }));

  const preferences: ExportPreferences = {
    theme: preferencesRow?.theme ?? "system",
    timer_visibility: preferencesRow?.timerVisibility ?? "full",
    keyboard_shortcuts: (preferencesRow?.keyboardShortcutsJson as
      ExportPreferences["keyboard_shortcuts"] | undefined) ?? {
      openStudyPicker: "/",
      startFavorite: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      pauseResume: "p",
      finish: "f",
      hideShowTimer: "h",
    },
  };

  return { manifest, profile, studyTypes, tags, timings, preferences };
}

function buildCsv(bundle: UserExportBundle): string {
  const studyById = new Map(bundle.studyTypes.map((s) => [s.id, s]));
  const tagById = new Map(bundle.tags.map((t) => [t.id, t]));

  const header = [
    "Date",
    "Study",
    "Modality",
    "Region",
    "Duration seconds",
    "Complexity",
    "Tags",
    "Included in benchmark",
  ];
  const lines = [header.map(csvField).join(",")];

  for (const timing of bundle.timings) {
    const study = studyById.get(timing.study_type_id);
    const tagNames = timing.tag_ids
      .map((id) => tagById.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    const excluded = timing.tag_ids.some(
      (id) => tagById.get(id)?.exclude_from_benchmark,
    );
    const row = [
      timing.finished_at,
      study?.name ?? "",
      study?.modality ?? "",
      study?.body_region ?? "",
      String(Math.round(timing.active_duration_ms / 1000)),
      timing.complexity,
      tagNames.join("; "),
      excluded ? "No" : "Yes",
    ];
    lines.push(row.map(csvField).join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

/** Builds the full export zip for a user, as a `Buffer` ready to stream. */
export async function buildUserExport(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<Buffer> {
  const bundle = await buildExportBundle(db, userId, now);

  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(bundle.manifest, null, 2)),
    "profile.json": strToU8(JSON.stringify(bundle.profile, null, 2)),
    "study-types.json": strToU8(JSON.stringify(bundle.studyTypes, null, 2)),
    "tags.json": strToU8(JSON.stringify(bundle.tags, null, 2)),
    "timings.json": strToU8(JSON.stringify(bundle.timings, null, 2)),
    "preferences.json": strToU8(JSON.stringify(bundle.preferences, null, 2)),
    "timings.csv": strToU8(buildCsv(bundle)),
  };

  const zipped = zipSync(files, { level: 6 });
  return Buffer.from(zipped);
}

/** `radtempo-export-YYYY-MM-DD.zip`, in UTC. */
export function exportFilename(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `radtempo-export-${iso}.zip`;
}
