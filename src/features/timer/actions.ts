"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { assertNotMaintenance } from "@/server/settings";
import { type ActionResult, toActionError } from "@/server/action-result";
import { syncAchievements } from "@/features/achievements/service";
import type { NewlyEarnedAchievement } from "@/features/achievements/service";
import * as timerService from "./service";
import type {
  ClassifyResult,
  CompletedEntrySummary,
  FinishResult,
  HistoryRow,
  TimerState,
} from "./service";

export type FinishActionResult = FinishResult & {
  /** Achievements newly earned as a result of this finish, if any. Additive
   * only — never affects the saved case itself. */
  newAchievements: NewlyEarnedAchievement[];
};

const uuidSchema = z.string().uuid();

const classifySchema = z.object({
  complexity: z.enum(["EASY", "TYPICAL", "DIFFICULT"]).optional(),
  tagIds: z.array(uuidSchema).optional(),
});

const historyOptionsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  studyTypeId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  complexity: z.enum(["EASY", "TYPICAL", "DIFFICULT"]).optional(),
  included: z.boolean().optional(),
  tagId: uuidSchema.optional(),
});

function revalidateTimerPaths() {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/dashboard");
  revalidatePath("/achievements");
}

export async function getActiveTimerAction(): Promise<
  ActionResult<TimerState | null>
> {
  try {
    const user = await requireUser();
    const data = await timerService.getActiveTimer(db, user.id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load your active timer.");
  }
}

export async function startTimerAction(
  studyTypeId: string,
): Promise<ActionResult<TimerState>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(studyTypeId);
    const { timer } = await timerService.startTimer(db, user.id, id);
    revalidateTimerPaths();
    return { ok: true, data: timer };
  } catch (error) {
    return toActionError(error, "Could not start the timer.");
  }
}

export async function pauseTimerAction(
  entryId: string,
): Promise<ActionResult<TimerState>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    const data = await timerService.pauseTimer(db, user.id, id);
    revalidateTimerPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not pause the timer.");
  }
}

export async function resumeTimerAction(
  entryId: string,
): Promise<ActionResult<TimerState>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    const data = await timerService.resumeTimer(db, user.id, id);
    revalidateTimerPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not resume the timer.");
  }
}

export async function finishTimerAction(
  entryId: string,
): Promise<ActionResult<FinishActionResult>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    const data = await timerService.finishTimer(db, user.id, id);
    const newAchievements = await syncAchievements(db, user.id);
    revalidateTimerPaths();
    return { ok: true, data: { ...data, newAchievements } };
  } catch (error) {
    return toActionError(
      error,
      "Could not save your case. Please retry — your timer is still recoverable.",
    );
  }
}

export async function discardActiveTimerAction(
  entryId: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    await timerService.discardActiveTimer(db, user.id, id);
    revalidateTimerPaths();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "Could not discard the timer.");
  }
}

export async function classifyEntryAction(
  entryId: string,
  input: unknown,
): Promise<ActionResult<ClassifyResult>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    const parsed = classifySchema.parse(input);
    const data = await timerService.classifyEntry(db, user.id, id, parsed);
    revalidateTimerPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not update this case.");
  }
}

export async function finalizeClassificationAction(
  entryId: string,
): Promise<ActionResult<CompletedEntrySummary>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    const data = await timerService.finalizeClassification(db, user.id, id);
    await syncAchievements(db, user.id);
    revalidateTimerPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not finalize this case.");
  }
}

export async function deleteEntryAction(
  entryId: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(entryId);
    await timerService.deleteEntry(db, user.id, id);
    // Achievements are not revoked on deletion (SPEC "Gamification"); this
    // sync only covers the rare case where deleting one case's tags/complexity
    // newly qualifies another achievement (e.g. after a correction). It never
    // removes previously-earned achievement_events rows.
    await syncAchievements(db, user.id);
    revalidateTimerPaths();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "Could not delete this case.");
  }
}

export async function listHistoryAction(
  options: unknown = {},
): Promise<ActionResult<HistoryRow[]>> {
  try {
    const user = await requireUser();
    const parsed = historyOptionsSchema.parse(options ?? {});
    const data = await timerService.listHistory(db, user.id, parsed);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load history.");
  }
}
