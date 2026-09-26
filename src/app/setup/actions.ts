"use server";

import { z } from "zod";
import { hasAnyUsers } from "@/server/setup-status";
import { auth } from "@/lib/auth";
import { runWithRegistrationAllowed } from "@/server/registration-gate";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export type SetupResult = { ok: true } | { ok: false; error: string };

export async function setupAction(
  _prev: SetupResult | null,
  formData: FormData,
): Promise<SetupResult> {
  if (await hasAnyUsers()) {
    return { ok: false, error: "Setup has already been completed." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  try {
    // First user becomes ADMIN automatically (see databaseHooks in
    // src/lib/auth.ts).
    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({ body: parsed.data }),
    );
    return { ok: true };
  } catch (error) {
    console.error("Setup failed:", error);
    return { ok: false, error: "Could not create the admin account." };
  }
}
