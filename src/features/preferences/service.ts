/**
 * Preferences service: theme, timer visibility, and keyboard shortcuts —
 * `user_preferences` is a single row per user, seeded at onboarding (see
 * `src/features/onboarding/service.ts`). See docs/SPEC.md, sections
 * "UI", "Timer", and "Keyboard shortcuts".
 */

import { eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import { userPreferences } from "@/db/schema";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "@/features/onboarding/service";
import { ensureUserDefaults } from "@/features/onboarding/service";

export type Theme = "light" | "dark" | "system";
export type TimerVisibility = "full" | "minimized" | "hidden_time";

export interface KeyboardShortcuts {
  openStudyPicker: string;
  startFavorite: string[];
  pauseResume: string;
  finish: string;
  hideShowTimer: string;
}

export interface Preferences {
  theme: Theme;
  timerVisibility: TimerVisibility;
  keyboardShortcuts: KeyboardShortcuts;
}

function toKeyboardShortcuts(value: unknown): KeyboardShortcuts {
  if (value && typeof value === "object") {
    const v = value as Partial<KeyboardShortcuts>;
    return {
      openStudyPicker:
        v.openStudyPicker ?? DEFAULT_KEYBOARD_SHORTCUTS.openStudyPicker,
      startFavorite: Array.isArray(v.startFavorite)
        ? v.startFavorite
        : [...DEFAULT_KEYBOARD_SHORTCUTS.startFavorite],
      pauseResume: v.pauseResume ?? DEFAULT_KEYBOARD_SHORTCUTS.pauseResume,
      finish: v.finish ?? DEFAULT_KEYBOARD_SHORTCUTS.finish,
      hideShowTimer:
        v.hideShowTimer ?? DEFAULT_KEYBOARD_SHORTCUTS.hideShowTimer,
    };
  }
  return {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    startFavorite: [...DEFAULT_KEYBOARD_SHORTCUTS.startFavorite],
  };
}

export async function getPreferences(
  db: DbClient,
  userId: string,
): Promise<Preferences> {
  await ensureUserDefaults(db, userId);
  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      theme: "system",
      timerVisibility: "full",
      keyboardShortcuts: toKeyboardShortcuts(undefined),
    };
  }
  return {
    theme: row.theme,
    timerVisibility: row.timerVisibility,
    keyboardShortcuts: toKeyboardShortcuts(row.keyboardShortcutsJson),
  };
}

export interface UpdatePreferencesInput {
  theme?: Theme;
  timerVisibility?: TimerVisibility;
  keyboardShortcuts?: KeyboardShortcuts;
}

export async function updatePreferences(
  db: DbClient,
  userId: string,
  input: UpdatePreferencesInput,
): Promise<Preferences> {
  await ensureUserDefaults(db, userId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.theme) patch.theme = input.theme;
  if (input.timerVisibility) patch.timerVisibility = input.timerVisibility;
  if (input.keyboardShortcuts) {
    patch.keyboardShortcutsJson = input.keyboardShortcuts;
  }
  await db
    .update(userPreferences)
    .set(patch)
    .where(eq(userPreferences.userId, userId));
  return getPreferences(db, userId);
}

export async function resetKeyboardShortcuts(
  db: DbClient,
  userId: string,
): Promise<Preferences> {
  return updatePreferences(db, userId, {
    keyboardShortcuts: {
      ...DEFAULT_KEYBOARD_SHORTCUTS,
      startFavorite: [...DEFAULT_KEYBOARD_SHORTCUTS.startFavorite],
    },
  });
}
