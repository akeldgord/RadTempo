"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { type ActionResult, toActionError } from "@/server/action-result";
import * as preferencesService from "./service";
import type { Preferences } from "./service";

const shortcutsSchema = z.object({
  openStudyPicker: z.string().min(1).max(20),
  startFavorite: z.array(z.string().min(1).max(20)),
  pauseResume: z.string().min(1).max(20),
  finish: z.string().min(1).max(20),
  hideShowTimer: z.string().min(1).max(20),
});

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
    const data = await preferencesService.resetKeyboardShortcuts(db, user.id);
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not reset keyboard shortcuts.");
  }
}
