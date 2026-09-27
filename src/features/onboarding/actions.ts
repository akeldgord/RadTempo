"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { type ActionResult, toActionError } from "@/server/action-result";
import { seedUserDefaults } from "./service";

const schema = z.object({
  useTemplates: z.boolean(),
  selectedTemplateIds: z.array(z.string()).optional(),
});

export async function completeOnboardingAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const parsed = schema.parse(input);
    await seedUserDefaults(db, user.id, parsed);
    revalidatePath("/");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "Could not finish onboarding.");
  }
}
