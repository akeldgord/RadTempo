import { count } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getInstanceSettings } from "@/server/settings";
import { claimInvite } from "@/server/invites";
import { runWithRegistrationAllowed } from "@/server/registration-gate";

export class RegistrationDeniedError extends Error {
  constructor(message = "Registration is not open") {
    super(message);
    this.name = "RegistrationDeniedError";
  }
}

async function userCount(): Promise<number> {
  const rows = await db.select({ value: count() }).from(userTable);
  return rows[0]?.value ?? 0;
}

/**
 * The single entry point for self-registration. Decides whether sign-up is
 * allowed (first user / open registration / valid invite), then performs the
 * Better Auth sign-up inside a context flag that `databaseHooks.user.create`
 * re-checks — so this is the only path that can create a user via
 * self-registration, even if someone calls Better Auth's endpoint directly.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  inviteToken?: string;
}) {
  const existingUsers = await userCount();
  if (existingUsers === 0) {
    // Self-registration can never create the first account — that only
    // ever happens through the trusted /setup flow (see src/app/setup).
    throw new RegistrationDeniedError(
      "This instance has not been set up yet. Visit /setup to create the initial administrator account.",
    );
  }

  const settings = await getInstanceSettings();
  if (settings.registrationMode !== "open") {
    if (!input.inviteToken) {
      throw new RegistrationDeniedError(
        "An invite is required to register on this instance.",
      );
    }
    // Atomically claim the invite (single UPDATE ... RETURNING) *before*
    // creating the account, so two concurrent registrations racing on the
    // same single-use invite can never both succeed.
    const invite = await claimInvite(input.inviteToken, input.email);
    if (!invite) {
      throw new RegistrationDeniedError(
        "This invite is invalid, expired, or already used.",
      );
    }
  }

  return runWithRegistrationAllowed(() =>
    auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
      },
    }),
  );
}
