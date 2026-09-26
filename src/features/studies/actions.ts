"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { type ActionResult, toActionError } from "@/server/action-result";
import * as studiesService from "./service";
import type { HomeSections, StudyType } from "./service";

const uuidSchema = z.string().uuid();

const createSchema = z.object({
  modality: z.enum(["CT", "MRI"]),
  bodyRegion: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(60),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  shortName: z.string().trim().min(1).max(60).optional(),
  modality: z.enum(["CT", "MRI"]).optional(),
  bodyRegion: z.string().trim().min(1).max(100).optional(),
});

function revalidateStudyPaths() {
  revalidatePath("/");
  revalidatePath("/studies");
}

export async function listStudyTypesAction(): Promise<
  ActionResult<StudyType[]>
> {
  try {
    const user = await requireUser();
    const data = await studiesService.listStudyTypes(db, user.id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load study types.");
  }
}

export async function getHomeSectionsAction(): Promise<
  ActionResult<HomeSections>
> {
  try {
    const user = await requireUser();
    const data = await studiesService.getHomeSections(db, user.id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not load your home screen.");
  }
}

export async function createStudyTypeAction(
  input: unknown,
): Promise<ActionResult<StudyType>> {
  try {
    const user = await requireUser();
    const parsed = createSchema.parse(input);
    const data = await studiesService.createStudyType(db, user.id, parsed);
    revalidateStudyPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not create study type.");
  }
}

export async function updateStudyTypeAction(
  studyTypeId: string,
  input: unknown,
): Promise<ActionResult<StudyType>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(studyTypeId);
    const parsed = updateSchema.parse(input);
    const data = await studiesService.updateStudyType(db, user.id, id, parsed);
    revalidateStudyPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not update study type.");
  }
}

export async function setFavoriteAction(
  studyTypeId: string,
  favorite: boolean,
): Promise<ActionResult<StudyType>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(studyTypeId);
    const parsedFavorite = z.boolean().parse(favorite);
    const data = await studiesService.setFavorite(
      db,
      user.id,
      id,
      parsedFavorite,
    );
    revalidateStudyPaths();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not update favorite.");
  }
}

export async function deleteStudyTypeAction(
  studyTypeId: string,
): Promise<ActionResult<{ deletedTimingsCount: number }>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(studyTypeId);
    const data = await studiesService.deleteStudyType(db, user.id, id);
    revalidateStudyPaths();
    revalidatePath("/history");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not delete study type.");
  }
}

export async function countStudyTypeTimingsAction(
  studyTypeId: string,
): Promise<ActionResult<number>> {
  try {
    const user = await requireUser();
    const id = uuidSchema.parse(studyTypeId);
    const data = await studiesService.countTimings(db, user.id, id);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not count study type cases.");
  }
}

export async function reorderStudyTypesAction(
  orderedIds: string[],
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const ids = z.array(uuidSchema).parse(orderedIds);
    await studiesService.reorderStudyTypes(db, user.id, ids);
    revalidateStudyPaths();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "Could not reorder study types.");
  }
}
