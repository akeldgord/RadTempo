import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql as rawSql, db } from "@/db";
import { user as userTable, instanceSettings, invites } from "@/db/schema";
import { auth } from "@/lib/auth";
import { registerUser, RegistrationDeniedError } from "@/server/registration";
import { runWithRegistrationAllowed } from "@/server/registration-gate";
import { createInvite } from "@/server/invites";
import { eq } from "drizzle-orm";

/**
 * Integration tests against a real Postgres database (radtempo_test),
 * exercising Better Auth's server API directly (`auth.api.signUpEmail`) plus
 * our registration gate. Run migrations against DATABASE_URL_TEST before
 * this suite (see `pnpm test:integration`, or run `pnpm db:migrate` with
 * DATABASE_URL pointed at the test DB).
 */

async function resetDatabase() {
  await rawSql`
    truncate table "user", "account", "session", "invites", "instance_settings"
    cascade
  `;
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await rawSql.end();
});

describe("registration and first-admin bootstrap", () => {
  it("makes the first created user an ADMIN", async () => {
    const result = await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "first-admin@example.com",
          password: "password123",
          name: "First Admin",
        },
      }),
    );

    expect(result.user.email).toBe("first-admin@example.com");

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "first-admin@example.com"));

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("ADMIN");
  });

  it("rejects sign-up in invite_only mode without an invite once a user exists", async () => {
    // First user (becomes ADMIN, bootstraps the instance).
    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "admin@example.com",
          password: "password123",
          name: "Admin",
        },
      }),
    );

    await db
      .insert(instanceSettings)
      .values({ registrationMode: "invite_only" });

    await expect(
      registerUser({
        email: "nobody@example.com",
        password: "password123",
        name: "Nobody",
      }),
    ).rejects.toBeInstanceOf(RegistrationDeniedError);

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "nobody@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("rejects a direct signUpEmail call that bypasses the registration gate", async () => {
    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "admin2@example.com",
          password: "password123",
          name: "Admin",
        },
      }),
    );

    // Not wrapped in runWithRegistrationAllowed and not the first user: the
    // databaseHooks.user.create.before hook must reject this outright, even
    // though no invite/registration_mode checks ran at all.
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "sneaky@example.com",
          password: "password123",
          name: "Sneaky",
        },
      }),
    ).rejects.toBeTruthy();

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "sneaky@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("accepts sign-up in invite_only mode with a valid invite, and the invite is single-use", async () => {
    const adminResult = await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "admin3@example.com",
          password: "password123",
          name: "Admin",
        },
      }),
    );

    await db
      .insert(instanceSettings)
      .values({ registrationMode: "invite_only" });

    const { token } = await createInvite({
      createdBy: adminResult.user.id,
      email: "invitee@example.com",
    });

    await registerUser({
      email: "invitee@example.com",
      password: "password123",
      name: "Invitee",
      inviteToken: token,
    });

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "invitee@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("USER");

    // The invite must now be used and reused attempts must fail, even though
    // registration_mode is still invite_only.
    await expect(
      registerUser({
        email: "invitee2@example.com",
        password: "password123",
        name: "Invitee Two",
        inviteToken: token,
      }),
    ).rejects.toBeInstanceOf(RegistrationDeniedError);

    const invitesRows = await db.select().from(invites);
    expect(invitesRows).toHaveLength(1);
    expect(invitesRows[0].usedAt).not.toBeNull();
  });

  it("accepts sign-up without an invite when registration_mode is open", async () => {
    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "admin4@example.com",
          password: "password123",
          name: "Admin",
        },
      }),
    );

    await db.insert(instanceSettings).values({ registrationMode: "open" });

    await registerUser({
      email: "open-signup@example.com",
      password: "password123",
      name: "Open Signup",
    });

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "open-signup@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("USER");
  });
});
