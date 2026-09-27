"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { type ActionResult, toActionError } from "@/server/action-result";
import { applyImport, parseImport, previewImport } from "./import";
import type { ApplyImportResult, ImportPreview } from "./import";
import { MAX_ZIP_BYTES } from "./schema";

async function fileToBuffer(file: unknown): Promise<Buffer> {
  if (!(file instanceof File)) {
    throw new Error("No file was uploaded.");
  }
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      `Export file is too large (max ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB).`,
    );
  }
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Previews an uploaded export archive for the current user without writing
 * anything. The apply action below re-parses and re-validates the file
 * itself rather than trusting this preview's result.
 */
export async function previewImportAction(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  try {
    const user = await requireUser();
    const buffer = await fileToBuffer(formData.get("file"));

    const parsed = parseImport(buffer);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const data = await previewImport(db, user.id, parsed.bundle);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not preview this import.");
  }
}

/**
 * Applies an uploaded export archive for the current user. Re-parses and
 * re-validates the file from scratch — it never trusts a client-held
 * preview result.
 */
export async function applyImportAction(
  formData: FormData,
): Promise<ActionResult<ApplyImportResult>> {
  try {
    const user = await requireUser();
    const buffer = await fileToBuffer(formData.get("file"));
    const applyPreferences = formData.get("applyPreferences") === "true";

    const parsed = parseImport(buffer);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const data = await applyImport(db, user.id, parsed.bundle, {
      applyPreferences,
    });
    revalidatePath("/settings");
    revalidatePath("/settings/data");
    revalidatePath("/history");
    revalidatePath("/dashboard");
    revalidatePath("/studies");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, "Could not import this file.");
  }
}
