"use server";

import { z } from "zod";
import { registerUser, RegistrationDeniedError } from "@/server/registration";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  inviteToken: z.string().trim().optional(),
});

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerAction(
  _prev: RegisterResult | null,
  formData: FormData,
): Promise<RegisterResult> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    inviteToken: formData.get("inviteToken") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  try {
    await registerUser(parsed.data);
    return { ok: true };
  } catch (error) {
    if (error instanceof RegistrationDeniedError) {
      return { ok: false, error: error.message };
    }
    console.error("Registration failed:", error);
    return { ok: false, error: "Could not create your account." };
  }
}
