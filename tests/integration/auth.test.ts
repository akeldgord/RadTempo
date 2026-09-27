import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { sql as rawSql, db } from "@/db";
import { user as userTable, instanceSettings, invites } from "@/db/schema";
import { auth } from "@/lib/auth";
import { registerUser, RegistrationDeniedError } from "@/server/registration";
import { runWithRegistrationAllowed } from "@/server/registration-gate";
import { createInvite } from "@/server/invites";
import { setupAction } from "@/app/setup/actions";
import { bootstrapInitialAdmin } from "@/server/bootstrap";
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

async function userCount(): Promise<number> {
  const rows = await db.select().from(userTable);
  return rows.length;
}

function setupFormData(fields: {
  setupToken: string;
  name: string;
  email: string;
  password: string;
}): FormData {
  const fd = new FormData();
  fd.set("setupToken", fields.setupToken);
  fd.set("name", fields.name);
  fd.set("email", fields.email);
  fd.set("password", fields.password);
  return fd;
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
  it("makes the first created user an ADMIN when created through the trusted gate", async () => {
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

  it("rejects a direct signUpEmail call with zero users (being first grants no permission)", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "sneaky-first@example.com",
          password: "password123",
          name: "Sneaky",
        },
      }),
    ).rejects.toBeTruthy();

    expect(await userCount()).toBe(0);
  });

  it("rejects registerUser() with zero users, pointing to /setup", async () => {
    await expect(
      registerUser({
        email: "nobody@example.com",
        password: "password123",
        name: "Nobody",
      }),
    ).rejects.toBeInstanceOf(RegistrationDeniedError);

    expect(await userCount()).toBe(0);
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

  it("two concurrent registrations racing one invite: exactly one succeeds", async () => {
    const adminResult = await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "admin-race@example.com",
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
    });

    const attempt = (email: string) =>
      registerUser({
        email,
        password: "password123",
        name: "Racer",
        inviteToken: token,
      }).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );

    const [a, b] = await Promise.all([
      attempt("racer-a@example.com"),
      attempt("racer-b@example.com"),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    const failed = [a, b].filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      error: expect.any(RegistrationDeniedError),
    });

    const raceUsers = await db
      .select()
      .from(userTable)
      .where(eq(userTable.role, "USER"));
    expect(raceUsers).toHaveLength(1);

    const invitesRows = await db.select().from(invites);
    expect(invitesRows).toHaveLength(1);
    expect(invitesRows[0].usedAt).not.toBeNull();
  });
});

describe("SETUP_TOKEN-gated /setup wizard", () => {
  const originalSetupToken = process.env.SETUP_TOKEN;

  afterEach(() => {
    if (originalSetupToken === undefined) {
      delete process.env.SETUP_TOKEN;
    } else {
      process.env.SETUP_TOKEN = originalSetupToken;
    }
  });

  it("a wrong setup token creates no user", async () => {
    process.env.SETUP_TOKEN = "correct-token";

    const result = await setupAction(
      null,
      setupFormData({
        setupToken: "wrong-token",
        name: "Admin",
        email: "setup-wrong@example.com",
        password: "password123",
      }),
    );

    expect(result.ok).toBe(false);
    expect(await userCount()).toBe(0);
  });

  it("no SETUP_TOKEN configured: setup creates no user", async () => {
    delete process.env.SETUP_TOKEN;

    const result = await setupAction(
      null,
      setupFormData({
        setupToken: "anything",
        name: "Admin",
        email: "setup-unconfigured@example.com",
        password: "password123",
      }),
    );

    expect(result.ok).toBe(false);
    expect(await userCount()).toBe(0);
  });

  it("the correct setup token creates exactly one ADMIN, and a second attempt fails", async () => {
    process.env.SETUP_TOKEN = "correct-token";

    const result = await setupAction(
      null,
      setupFormData({
        setupToken: "correct-token",
        name: "Admin",
        email: "setup-correct@example.com",
        password: "password123",
      }),
    );

    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "setup-correct@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("ADMIN");
    expect(await userCount()).toBe(1);

    const second = await setupAction(
      null,
      setupFormData({
        setupToken: "correct-token",
        name: "Someone Else",
        email: "setup-second@example.com",
        password: "password123",
      }),
    );

    expect(second.ok).toBe(false);
    expect(await userCount()).toBe(1);
  });
});

describe("bootstrapInitialAdmin", () => {
  const originalEmail = process.env.INITIAL_ADMIN_EMAIL;
  const originalPassword = process.env.INITIAL_ADMIN_PASSWORD;

  afterEach(() => {
    if (originalEmail === undefined) delete process.env.INITIAL_ADMIN_EMAIL;
    else process.env.INITIAL_ADMIN_EMAIL = originalEmail;
    if (originalPassword === undefined)
      delete process.env.INITIAL_ADMIN_PASSWORD;
    else process.env.INITIAL_ADMIN_PASSWORD = originalPassword;
  });

  it("creates exactly one admin, and a repeated call creates none", async () => {
    process.env.INITIAL_ADMIN_EMAIL = "bootstrap-admin@example.com";
    process.env.INITIAL_ADMIN_PASSWORD = "password123";

    await bootstrapInitialAdmin();

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "bootstrap-admin@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("ADMIN");
    expect(await userCount()).toBe(1);

    await bootstrapInitialAdmin();
    expect(await userCount()).toBe(1);
  });
});
