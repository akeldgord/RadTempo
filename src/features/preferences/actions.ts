"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { assertNotMaintenance } from "@/server/settings";
import { type ActionResult, toActionError } from "@/server/action-result";
import * as preferencesService from "./service";
import type { Preferences } from "./service";

const shortcutsSchema = z
  .object({
    openStudyPicker: z.string().min(1).max(20),
    startFavorite: z.array(z.string().min(1).max(20)).max(9),
    pauseResume: z.string().min(1).max(20),
    finish: z.string().min(1).max(20),
    hideShowTimer: z.string().min(1).max(20),
  })
  .refine(
    (s) => {
      const keys = [
        s.openStudyPicker,
        ...s.startFavorite,
        s.pauseResume,
        s.finish,
        s.hideShowTimer,
      ].map((k) => k.toLowerCase());
      return new Set(keys).size === keys.length;
    },
    { message: "Each shortcut must use a different key." },
  );

const updateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  timerVisibility: z.enum(["full", "minimized", "hidden_time"]).optional(),
  keyboardShortcuts: shortcutsSchema.optional(),
});

export async function getPreferencesAction(): Promise<
  ActionResult<Preferences>
> {
  try {
    const user = await requireUser();
    const data = await preferencesService.getPreferences(db, user.id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load your preferences.");
  }
}

export async function updatePreferencesAction(
  input: unknown,
): Promise<ActionResult<Preferences>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const parsed = updateSchema.parse(input);
    const data = await preferencesService.updatePreferences(
      db,
      user.id,
      parsed,
    );
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not save your preferences.");
  }
}

export async function resetKeyboardShortcutsAction(): Promise<
  ActionResult<Preferences>
> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const data = await preferencesService.resetKeyboardShortcuts(db, user.id);
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not reset keyboard shortcuts.");
  }
}
