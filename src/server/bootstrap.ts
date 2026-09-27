import { count } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { runWithRegistrationAllowed } from "@/server/registration-gate";

/**
 * If no users exist and INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD are set,
 * create the first (admin) account automatically at startup. This lets
 * operators skip the interactive /setup wizard for scripted deployments.
 * Safe to call multiple times: it is a no-op once any user exists.
 */
export async function bootstrapInitialAdmin(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;

  const rows = await db.select({ value: count() }).from(userTable);
  const existingUsers = rows[0]?.value ?? 0;
  if (existingUsers > 0) return;

  await runWithRegistrationAllowed(() =>
    auth.api.signUpEmail({
      body: {
        email,
        password,
        name: "Administrator",
      },
    }),
  );

  console.log(`[bootstrap] Created initial admin account for ${email}`);
}
