import { count } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  runExclusiveFirstUserSetup,
  runWithRegistrationAllowed,
} from "@/server/registration-gate";

/**
 * If no users exist and INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD are set,
 * create the first (admin) account automatically at startup. This lets
 * operators skip the interactive /setup wizard for scripted deployments.
 * Safe to call multiple times, including concurrently across process
 * instances: the check-and-create runs under the same advisory lock as the
 * `/setup` wizard, so at most one admin is ever created.
 */
export async function bootstrapInitialAdmin(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;

  const created = await runExclusiveFirstUserSetup(async () => {
    const rows = await db.select({ value: count() }).from(userTable);
    const existingUsers = rows[0]?.value ?? 0;
    if (existingUsers > 0) return false;

    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email,
          password,
          name: "Administrator",
        },
      }),
    );
    return true;
  });

  // Never log the email/password — see docs/security-review.md.
  if (created) {
    console.log("[bootstrap] Created initial admin account");
  }
}
