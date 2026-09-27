import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Defense-in-depth gate for self-registration.
 *
 * All registration policy (registration_mode, invites, first-user bootstrap)
 * is decided in `src/server/registration.ts` *before* Better Auth's
 * `signUpEmail` is called. The `databaseHooks.user.create.before` hook in
 * `src/lib/auth.ts` then re-checks this flag so that a direct call to the
 * Better Auth sign-up endpoint (bypassing our route) can never create a user
 * unless our vetted registration flow explicitly allowed it for the current
 * request.
 */
const storage = new AsyncLocalStorage<{ allowed: boolean }>();

export async function runWithRegistrationAllowed<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ allowed: true }, fn);
}

export function isRegistrationAllowedInCurrentContext(): boolean {
  return storage.getStore()?.allowed === true;
}

/**
 * Serializes the "is this instance still un-initialized?" check plus the
 * initial-admin creation that follows it, across process instances, using a
 * Postgres advisory lock held for a DB transaction's lifetime. Without this,
 * two concurrent /setup submissions (or a /setup submission racing
 * `bootstrapInitialAdmin`) could both observe zero users and both create an
 * admin. Callers must still re-check the user count *inside* `fn`, after
 * the lock is held, since the check that decided to call this may itself be
 * stale by the time the lock is acquired.
 */
export async function runExclusiveFirstUserSetup<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // A single fixed key: only one "first user setup" can run at a time,
    // instance-wide. Held for the transaction; released automatically on
    // commit/rollback.
    await tx.execute(sql`select pg_advisory_xact_lock(72930411)`);
    return fn();
  });
}
