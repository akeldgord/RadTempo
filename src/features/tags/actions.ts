"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { assertNotMaintenance } from "@/server/settings";
import { type ActionResult, toActionError } from "@/server/action-result";
import * as tagsService from "./service";
import type { Tag } from "./service";

const uuidSchema = z.string().uuid();

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  excludeFromBenchmark: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  excludeFromBenchmark: z.boolean().optional(),
});

export async function listTagsAction(): Promise<ActionResult<Tag[]>> {
  try {
    const user = await requireUser();
    const data = await tagsService.listTags(db, user.id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load tags.");
  }
}

export async function createTagAction(
  input: unknown,
): Promise<ActionResult<Tag>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const parsed = createSchema.parse(input);
    const data = await tagsService.createTag(db, user.id, parsed);
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not create tag.");
  }
}

export async function updateTagAction(
  tagId: string,
  input: unknown,
): Promise<ActionResult<Tag>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(tagId);
    const parsed = updateSchema.parse(input);
    const data = await tagsService.updateTag(db, user.id, id, parsed);
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not update tag.");
  }
}

export async function deleteTagAction(
  tagId: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await assertNotMaintenance();
    const id = uuidSchema.parse(tagId);
    await tagsService.deleteTag(db, user.id, id);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "Could not delete tag.");
  }
}
