/**
 * Onboarding: seeds a new user's study types, built-in tags, and default
 * preferences. Idempotent — safe to call more than once (e.g. a retried
 * request) without creating duplicates. See docs/SPEC.md, sections "Study
 * types", "Complexity & tags", "Keyboard shortcuts".
 */

import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  tags as tagsTable,
  user as userTable,
  userPreferences,
  userStudyTypes,
} from "@/db/schema";
import { STUDY_TYPE_TEMPLATES } from "@/features/studies/templates";

export interface BuiltInTagSeed {
  name: string;
  excludeFromBenchmark: boolean;
}

/** Built-in tags seeded for every user. All exclude_from_benchmark=true per
 * SPEC ("Complexity & tags"). */
export const BUILT_IN_TAGS: BuiltInTagSeed[] = [
  { name: "Interrupted", excludeFromBenchmark: true },
  { name: "Teaching", excludeFromBenchmark: true },
  { name: "Technical issue", excludeFromBenchmark: true },
];

/** Default keyboard shortcuts, per SPEC ("Keyboard shortcuts"). Stored as
 * `user_preferences.keyboard_shortcuts_json`. */
export const DEFAULT_KEYBOARD_SHORTCUTS = {
  openStudyPicker: "/",
  startFavorite: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  pauseResume: "p",
  finish: "f",
  hideShowTimer: "h",
} as const;

async function seedTagsIfMissing(db: DbClient, userId: string): Promise<void> {
  const existing = await db
    .select({ name: tagsTable.name })
    .from(tagsTable)
    .where(and(eq(tagsTable.userId, userId), eq(tagsTable.builtIn, true)));
  const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));

  const missing = BUILT_IN_TAGS.filter(
    (t) => !existingNames.has(t.name.toLowerCase()),
  );
  if (missing.length === 0) return;

  await db.insert(tagsTable).values(
    missing.map((t) => ({
      userId,
      name: t.name,
      builtIn: true,
      excludeFromBenchmark: t.excludeFromBenchmark,
    })),
  );
}

async function seedPreferencesIfMissing(
  db: DbClient,
  userId: string,
): Promise<void> {
  const existing = await db
    .select({ userId: userPreferences.userId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(userPreferences).values({
    userId,
    theme: "system",
    timerVisibility: "full",
    keyboardShortcutsJson: DEFAULT_KEYBOARD_SHORTCUTS,
  });
}

async function seedTemplateStudyTypesIfMissing(
  db: DbClient,
  userId: string,
  selectedTemplateIds: string[] | undefined,
): Promise<void> {
  const existing = await db
    .select({ createdFromTemplate: userStudyTypes.createdFromTemplate })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const existingTemplateIds = new Set(
    existing
      .map((r) => r.createdFromTemplate)
      .filter((v): v is string => v != null),
  );

  const templates = selectedTemplateIds
    ? STUDY_TYPE_TEMPLATES.filter((t) => selectedTemplateIds.includes(t.id))
    : STUDY_TYPE_TEMPLATES;

  const toInsert = templates.filter((t) => !existingTemplateIds.has(t.id));
  if (toInsert.length === 0) return;

  const maxSortRows = await db
    .select({ sortOrder: userStudyTypes.sortOrder })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  let nextSort =
    maxSortRows.length > 0
      ? Math.max(...maxSortRows.map((r) => r.sortOrder)) + 1
      : 0;

  await db.insert(userStudyTypes).values(
    toInsert.map((t) => ({
      userId,
      modality: t.modality,
      bodyRegion: t.bodyRegion,
      name: t.name,
      shortName: t.shortName,
      sortOrder: nextSort++,
      favorite: false,
      createdFromTemplate: t.id,
    })),
  );
}

export interface SeedUserDefaultsInput {
  /** If false, no template study types are copied (the user starts empty
   * and creates their own custom study types). Tags and preferences are
   * always seeded either way. */
  useTemplates: boolean;
  /** When set, only these template ids are copied instead of the full
   * default set (the onboarding "Customize" path). Ignored when
   * useTemplates is false. */
  selectedTemplateIds?: string[];
}

/**
 * Idempotently provisions a new user's defaults: template study types (or
 * none, if `useTemplates` is false), built-in tags, default preferences,
 * and marks `user.onboardedAt`. Safe to call multiple times.
 */
export async function seedUserDefaults(
  db: DbClient,
  userId: string,
  input: SeedUserDefaultsInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.useTemplates) {
      await seedTemplateStudyTypesIfMissing(
        tx,
        userId,
        input.selectedTemplateIds,
      );
    }
    await seedTagsIfMissing(tx, userId);
    await seedPreferencesIfMissing(tx, userId);
    await tx
      .update(userTable)
      .set({ onboardedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(userTable.id, userId), isNull(userTable.onboardedAt)));
  });
}

/** Ensures tags/preferences exist for a user regardless of onboarding
 * status (e.g. a user created before this feature existed, or a defensive
 * check before reading preferences). Does not touch study types or
 * `onboardedAt`. */
export async function ensureUserDefaults(
  db: DbClient,
  userId: string,
): Promise<void> {
  await seedTagsIfMissing(db, userId);
  await seedPreferencesIfMissing(db, userId);
}
