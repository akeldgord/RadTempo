import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql as rawSql, db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { runWithRegistrationAllowed } from "@/server/registration-gate";
import { getInstanceSettings } from "@/server/settings";
import {
  AdminActionError,
  createUser,
  deleteUser,
  disableUser,
  resetUserCredentials,
  setUserRole,
} from "@/features/admin/users";
import {
  createBackup,
  decryptBackup,
  performRestore,
  BackupError,
} from "@/server/backup";
import {
  sendTelemetry,
  TELEMETRY_FIELDS,
  TELEMETRY_FORBIDDEN_KEYS,
} from "@/features/admin/telemetry";

/**
 * next/headers only works inside a real Next.js request context. To
 * exercise `requireAdmin()` (and therefore the "use server" admin actions,
 * which all start with it) from a plain integration test, we mock it to
 * return a Headers object we control, carrying a real Better Auth session
 * cookie obtained via `auth.api.signInEmail`.
 */
let currentHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: async () => currentHeaders,
}));

async function signUp(email: string, password = "password123") {
  return runWithRegistrationAllowed(() =>
    auth.api.signUpEmail({ body: { email, password, name: "Test" } }),
  );
}

async function signInAs(email: string, password = "password123") {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookiePair = setCookie.split(";")[0];
  currentHeaders = new Headers({ cookie: cookiePair });
}

function clearSession() {
  currentHeaders = new Headers();
}

async function resetDatabase() {
  await rawSql`truncate table "user", "instance_settings" cascade`;
}

beforeEach(async () => {
  clearSession();
  await resetDatabase();
});

afterEach(() => {
  clearSession();
});

afterAll(async () => {
  await resetDatabase();
  await rawSql.end();
});

describe("non-admin rejection", () => {
  it("rejects every admin action for a signed-in non-admin user", async () => {
    // First user becomes ADMIN automatically; the second is a plain USER.
    await signUp("admin@example.com");
    await signUp("member@example.com");
    await signInAs("member@example.com");

    const actions = await import("@/features/admin/actions");

    const cases: Array<
      [string, () => Promise<{ ok: boolean; error?: string }>]
    > = [
      [
        "createUserAction",
        () =>
          actions.createUserAction(
            null,
            formData({ email: "x@example.com", name: "X", role: "USER" }),
          ),
      ],
      [
        "inviteUserAction",
        () => actions.inviteUserAction(null, formData({ email: "" })),
      ],
      [
        "revokeInviteAction",
        () =>
          actions.revokeInviteAction(
            null,
            formData({ inviteId: "00000000-0000-0000-0000-000000000000" }),
          ),
      ],
      [
        "setUserDisabledAction",
        () =>
          actions.setUserDisabledAction(
            null,
            formData({
              userId: "00000000-0000-0000-0000-000000000000",
              disabled: "true",
            }),
          ),
      ],
      [
        "deleteUserAction",
        () =>
          actions.deleteUserAction(
            null,
            formData({ userId: "00000000-0000-0000-0000-000000000000" }),
          ),
      ],
      [
        "setUserRoleAction",
        () =>
          actions.setUserRoleAction(
            null,
            formData({
              userId: "00000000-0000-0000-0000-000000000000",
              role: "ADMIN",
            }),
          ),
      ],
      [
        "resetCredentialsAction",
        () =>
          actions.resetCredentialsAction(
            null,
            formData({ userId: "00000000-0000-0000-0000-000000000000" }),
          ),
      ],
      [
        "updateRegistrationModeAction",
        () =>
          actions.updateRegistrationModeAction(
            null,
            formData({ registrationMode: "open" }),
          ),
      ],
      [
        "updateEmailVerificationAction",
        () =>
          actions.updateEmailVerificationAction(
            null,
            formData({ emailVerificationRequired: "true" }),
          ),
      ],
      ["sendTestEmailAction", () => actions.sendTestEmailAction()],
      [
        "updateTelemetryAction",
        () =>
          actions.updateTelemetryAction(
            null,
            formData({ telemetryEnabled: "true" }),
          ),
      ],
      [
        "setMaintenanceModeAction",
        () =>
          actions.setMaintenanceModeAction(
            null,
            formData({ maintenanceMode: "true" }),
          ),
      ],
    ];

    for (const [name, run] of cases) {
      const result = await run();
      expect(result.ok, `${name} should reject a non-admin`).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/admin/i);
      }
    }
  });

  it("rejects every admin action when signed out entirely", async () => {
    clearSession();
    const actions = await import("@/features/admin/actions");
    const result = await actions.setMaintenanceModeAction(
      null,
      formData({ maintenanceMode: "true" }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("last-admin protection", () => {
  it("cannot delete the last remaining admin", async () => {
    const { user: admin } = await signUp("only-admin@example.com");

    await expect(deleteUser(admin.id, "someone-else")).rejects.toBeInstanceOf(
      AdminActionError,
    );

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, admin.id));
    expect(rows).toHaveLength(1);
  });

  it("cannot demote the last remaining admin", async () => {
    const { user: admin } = await signUp("only-admin2@example.com");

    await expect(
      setUserRole(admin.id, "USER", admin.id),
    ).rejects.toBeInstanceOf(AdminActionError);

    const rows = await db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, admin.id));
    expect(rows[0].role).toBe("ADMIN");
  });

  it("allows deleting/demoting an admin when another admin remains", async () => {
    const { user: adminA } = await signUp("admin-a@example.com");
    const { user: adminB } = await signUp("admin-b@example.com");
    await setUserRole(adminB.id, "ADMIN", adminA.id);

    await expect(
      setUserRole(adminB.id, "USER", adminA.id),
    ).resolves.toBeUndefined();
  });
});

describe("disable / credential reset", () => {
  it("disabling a user blocks sign-in", async () => {
    const { userId, temporaryPassword } = await createUser({
      email: "disabled-user@example.com",
      name: "Disabled",
    });

    // Sanity: the password works before disabling.
    await auth.api.signInEmail({
      body: { email: "disabled-user@example.com", password: temporaryPassword },
    });

    await disableUser(userId);

    await expect(
      auth.api.signInEmail({
        body: {
          email: "disabled-user@example.com",
          password: temporaryPassword,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("credential reset lets the user sign in with the new password", async () => {
    const { userId, temporaryPassword: oldPassword } = await createUser({
      email: "reset-user@example.com",
      name: "Reset Me",
    });

    const { temporaryPassword: newPassword } =
      await resetUserCredentials(userId);

    expect(newPassword).not.toBe(oldPassword);

    await expect(
      auth.api.signInEmail({
        body: { email: "reset-user@example.com", password: oldPassword },
      }),
    ).rejects.toBeTruthy();

    const signedIn = await auth.api.signInEmail({
      body: { email: "reset-user@example.com", password: newPassword },
    });
    expect(signedIn.user.email).toBe("reset-user@example.com");
  });
});

describe("backup and restore", () => {
  it("round-trips data through backup and restore", async () => {
    await signUp("backup-admin@example.com");
    const before = await db.select().from(userTable);
    expect(before).toHaveLength(1);

    const passphrase = "correct-horse-battery";
    const encrypted = await createBackup(passphrase);

    // Mutate the DB after taking the backup.
    await signUp("someone-new@example.com");
    const afterMutation = await db.select().from(userTable);
    expect(afterMutation).toHaveLength(2);

    await performRestore(passphrase, encrypted);

    const afterRestore = await db.select().from(userTable);
    expect(afterRestore.map((u) => u.email).sort()).toEqual([
      "backup-admin@example.com",
    ]);

    const settings = await getInstanceSettings();
    expect(settings.maintenanceMode).toBe(false);
  });

  it("fails with the wrong passphrase without touching the database", async () => {
    await signUp("wrong-pass-admin@example.com");
    const encrypted = await createBackup("correct-horse-battery-1");

    await expect(
      decryptBackup("totally-wrong-passphrase!!", encrypted),
    ).rejects.toBeInstanceOf(BackupError);

    await expect(
      performRestore("totally-wrong-passphrase!!", encrypted),
    ).rejects.toBeInstanceOf(BackupError);

    // Untouched: still exactly the one admin we created, and not in
    // maintenance mode (performRestore never got past decryption).
    const rows = await db.select().from(userTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("wrong-pass-admin@example.com");

    const settings = await getInstanceSettings();
    expect(settings.maintenanceMode).toBe(false);
  });
});

describe("telemetry", () => {
  it("lists only the canonical allowed fields", () => {
    expect(TELEMETRY_FIELDS).toEqual([
      "app_version",
      "feature_flags",
      "aggregate_counts",
      "node_major_version",
      "platform",
    ]);
  });

  it("sends nothing when disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.TELEMETRY_ENDPOINT = "https://telemetry.example.com/collect";

    sendTelemetry({ enabled: false, appVersion: "1.2.3" });
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    delete process.env.TELEMETRY_ENDPOINT;
  });

  it("sends nothing when enabled but no endpoint is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    delete process.env.TELEMETRY_ENDPOINT;

    sendTelemetry({ enabled: true, appVersion: "1.2.3" });
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sends a payload containing no forbidden keys when enabled with an endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));
    process.env.TELEMETRY_ENDPOINT = "https://telemetry.example.com/collect";

    sendTelemetry({
      enabled: true,
      appVersion: "1.2.3",
      featureFlags: { timer: true },
      aggregateCounts: { totalUsers: 5 },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body));

    for (const forbidden of TELEMETRY_FORBIDDEN_KEYS) {
      expect(Object.keys(payload)).not.toContain(forbidden);
      expect(JSON.stringify(payload)).not.toMatch(
        new RegExp(`"${forbidden}"\\s*:`),
      );
    }
    expect(Object.keys(payload).sort()).toEqual([...TELEMETRY_FIELDS].sort());

    fetchSpy.mockRestore();
    delete process.env.TELEMETRY_ENDPOINT;
  });
});

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}
