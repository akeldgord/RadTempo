/**
 * Account deletion: self-service, with explicit typed-email confirmation.
 * See docs/SPEC.md, section "Account deletion".
 *
 * Deleting the `user` row cascades every row that belongs to it (timings,
 * study types, tags, preferences, achievements, sessions, auth accounts —
 * see `src/db/schema.ts`, every user-owned table's FK is `ON DELETE
 * CASCADE`), so this service only needs to run the confirmation checks and
 * issue the delete.
 */

import { and, count, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db";
import { user as userTable } from "@/db/schema";
import { assertNotMaintenance } from "@/server/settings";
import { ValidationError } from "@/server/errors";

export class LastAdminError extends Error {
  constructor(
    message = "You are the last remaining admin. Promote another user to admin before deleting your account.",
  ) {
    super(message);
    this.name = "LastAdminError";
  }
}

async function isLastActiveAdmin(
  db: DbClient,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ role: userTable.role, disabledAt: userTable.disabledAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row || row.role !== "ADMIN" || row.disabledAt) return false;

  const admins = await db
    .select({ value: count() })
    .from(userTable)
    .where(and(eq(userTable.role, "ADMIN"), isNull(userTable.disabledAt)));
  return (admins[0]?.value ?? 0) <= 1;
}

export interface DeleteOwnAccountInput {
  /** Must exactly match the user's own email (case-sensitive, no
   * trimming leniency beyond what the caller already applied) — this is
   * the "type your email to confirm" step, not a password re-check. */
  confirmEmail: string;
}

/**
 * Deletes the calling user's own account and every row that cascades from
 * it. Refuses if `confirmEmail` doesn't match the account's email exactly,
 * or if the user is the instance's last remaining active admin (deleting
 * would leave the instance with no one able to administer it).
 */
export async function deleteOwnAccount(
  db: DbClient,
  userId: string,
  input: DeleteOwnAccountInput,
): Promise<void> {
  await assertNotMaintenance();

  const rows = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ValidationError("Account not found.");
  }

  if (input.confirmEmail !== row.email) {
    throw new ValidationError(
      "Type your account email exactly to confirm deletion.",
    );
  }

  if (await isLastActiveAdmin(db, userId)) {
    throw new LastAdminError();
  }

  await db.delete(userTable).where(eq(userTable.id, userId));
}
