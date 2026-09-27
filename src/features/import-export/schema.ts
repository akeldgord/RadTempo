/**
 * Zod schemas for the RadTempo export/import bundle, `export_schema_version`
 * 1. See docs/SPEC.md, section "Export / import".
 *
 * These schemas are the single source of truth for what a well-formed
 * export/import bundle looks like. `parseImport` (see `import.ts`) runs an
 * untrusted upload through `importBundleSchema` before anything else touches
 * it — nothing here trusts client-supplied structure.
 */

import { z } from "zod";

export const EXPORT_SCHEMA_VERSION = 1 as const;

/** Hard caps from the SPEC: a bundle this large is refused outright, before
 * any per-row validation runs. */
export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_TIMINGS = 200_000;

/** Tolerance for `active_duration_ms` vs. `finished_at - started_at -
 * paused_duration_ms`, to absorb rounding in older exports. */
export const DURATION_TOLERANCE_MS = 1000;

const uuid = z.string().uuid();
const isoDateTime = z.iso.datetime({ offset: true });

export const manifestSchema = z.object({
  export_schema_version: z.literal(EXPORT_SCHEMA_VERSION),
  app_version: z.string().min(1).max(100),
  created_at: isoDateTime,
  app: z.literal("radtempo"),
});
export type ExportManifest = z.infer<typeof manifestSchema>;

export const profileSchema = z.object({
  name: z.string().max(200),
  /** Informational only — never used to match users on import. */
  email: z.string().email(),
  created_at: isoDateTime,
});
export type ExportProfile = z.infer<typeof profileSchema>;

export const studyTypeSchema = z.object({
  id: uuid,
  modality: z.string().min(1).max(50),
  body_region: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  short_name: z.string().min(1).max(50),
  sort_order: z.number().int(),
  favorite: z.boolean(),
  created_from_template: z.string().max(100).nullable(),
  created_at: isoDateTime,
});
export type ExportStudyType = z.infer<typeof studyTypeSchema>;

export const tagSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  built_in: z.boolean(),
  exclude_from_benchmark: z.boolean(),
  created_at: isoDateTime,
});
export type ExportTag = z.infer<typeof tagSchema>;

export const pauseEventSchema = z.object({
  paused_at: isoDateTime,
  resumed_at: isoDateTime.nullable(),
});
export type ExportPauseEvent = z.infer<typeof pauseEventSchema>;

export const timingSchema = z
  .object({
    id: uuid,
    study_type_id: uuid,
    status: z.literal("COMPLETED"),
    started_at: isoDateTime,
    finished_at: isoDateTime,
    paused_duration_ms: z.number().int().min(0),
    active_duration_ms: z.number().int().min(0),
    complexity: z.enum(["EASY", "TYPICAL", "DIFFICULT"]),
    tag_ids: z.array(uuid).max(50),
    classification_finalized_at: isoDateTime.nullable(),
    pause_events: z.array(pauseEventSchema).max(500),
  })
  .superRefine((entry, ctx) => {
    const started = new Date(entry.started_at).getTime();
    const finished = new Date(entry.finished_at).getTime();

    if (finished < started) {
      ctx.addIssue({
        code: "custom",
        message: "finished_at must be at or after started_at",
        path: ["finished_at"],
      });
      return;
    }

    const expectedActiveMs = finished - started - entry.paused_duration_ms;
    if (
      Math.abs(expectedActiveMs - entry.active_duration_ms) >
      DURATION_TOLERANCE_MS
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "active_duration_ms is inconsistent with started_at/finished_at/paused_duration_ms",
        path: ["active_duration_ms"],
      });
    }
  });
export type ExportTiming = z.infer<typeof timingSchema>;

export const keyboardShortcutsSchema = z.object({
  openStudyPicker: z.string().min(1).max(20),
  startFavorite: z.array(z.string().min(1).max(20)),
  pauseResume: z.string().min(1).max(20),
  finish: z.string().min(1).max(20),
  hideShowTimer: z.string().min(1).max(20),
});

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  timer_visibility: z.enum(["full", "minimized", "hidden_time"]),
  keyboard_shortcuts: keyboardShortcutsSchema,
});
export type ExportPreferences = z.infer<typeof preferencesSchema>;

/** The fully-parsed contents of an export/import bundle (the six JSON
 * files; `timings.csv` is derived and never round-tripped on import). */
export const importBundleSchema = z
  .object({
    manifest: manifestSchema,
    profile: profileSchema,
    studyTypes: z.array(studyTypeSchema).max(2000),
    tags: z.array(tagSchema).max(500),
    timings: z.array(timingSchema).max(MAX_TIMINGS),
    preferences: preferencesSchema,
  })
  .superRefine((bundle, ctx) => {
    const studyTypeIds = new Set(bundle.studyTypes.map((s) => s.id));
    const tagIds = new Set(bundle.tags.map((t) => t.id));

    bundle.timings.forEach((timing, index) => {
      if (!studyTypeIds.has(timing.study_type_id)) {
        ctx.addIssue({
          code: "custom",
          message: `timing references unknown study_type_id ${timing.study_type_id}`,
          path: ["timings", index, "study_type_id"],
        });
      }
      timing.tag_ids.forEach((tagId, tagIndex) => {
        if (!tagIds.has(tagId)) {
          ctx.addIssue({
            code: "custom",
            message: `timing references unknown tag id ${tagId}`,
            path: ["timings", index, "tag_ids", tagIndex],
          });
        }
      });
    });
  });
export type ImportBundle = z.infer<typeof importBundleSchema>;
