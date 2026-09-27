import { count } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getInstanceSettings } from "@/server/settings";
import { findValidInvite, consumeInvite } from "@/server/invites";
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
  const isFirstUser = existingUsers === 0;

  let inviteId: string | null = null;

  if (!isFirstUser) {
    const settings = await getInstanceSettings();
    if (settings.registrationMode === "open") {
      // allowed
    } else {
      if (!input.inviteToken) {
        throw new RegistrationDeniedError(
          "An invite is required to register on this instance.",
        );
      }
      const invite = await findValidInvite(input.inviteToken, input.email);
      if (!invite) {
        throw new RegistrationDeniedError(
          "This invite is invalid, expired, or already used.",
        );
      }
      inviteId = invite.id;
    }
  }

  const result = await runWithRegistrationAllowed(() =>
    auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
      },
    }),
  );

  if (inviteId) {
    await consumeInvite(inviteId);
  }

  return result;
}
