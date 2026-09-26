import { AsyncLocalStorage } from "node:async_hooks";

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
