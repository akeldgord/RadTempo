import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql as rawSql, db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runWithRegistrationAllowed } from "@/server/registration-gate";

/**
 * EMAIL_VERIFICATION_REQUIRED is the single source of truth for whether
 * email verification is enforced (`src/lib/auth.ts`, `src/server/settings.ts`
 * — see docs/SPEC.md "Auth & accounts"). Better Auth reads this flag once,
 * at module construction time, so each case here resets the module registry
 * and re-imports `@/lib/auth` under a fresh env. Nothing is actually
 * emailed: `sendMail` is stubbed.
 */

async function resetDatabase() {
  await rawSql`
    truncate table "user", "account", "session", "invites", "instance_settings"
    cascade
  `;
}

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.doUnmock("@/server/mailer");
});

afterAll(async () => {
  await resetDatabase();
  await rawSql.end();
});

async function freshAuth() {
  vi.resetModules();
  vi.doMock("@/server/mailer", async () => {
    const actual =
      await vi.importActual<typeof import("@/server/mailer")>(
        "@/server/mailer",
      );
    return {
      ...actual,
      sendMail: vi.fn().mockResolvedValue({ sent: false }),
    };
  });
  const mod = await import("@/lib/auth");
  return mod.auth;
}

describe("email verification enforcement (EMAIL_VERIFICATION_REQUIRED)", () => {
  it("rejects sign-in for an unverified user when required and SMTP is configured", async () => {
    process.env.SMTP_HOST = "smtp.test.invalid";
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    const auth = await freshAuth();

    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "unverified@example.com",
          password: "password123",
          name: "Unverified",
        },
      }),
    );

    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, "unverified@example.com"));
    expect(rows[0]?.emailVerified).toBe(false);

    await expect(
      auth.api.signInEmail({
        body: { email: "unverified@example.com", password: "password123" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows sign-in for an unverified user when not required", async () => {
    process.env.SMTP_HOST = "smtp.test.invalid";
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    const auth = await freshAuth();

    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "not-required@example.com",
          password: "password123",
          name: "Not Required",
        },
      }),
    );

    const result = await auth.api.signInEmail({
      body: { email: "not-required@example.com", password: "password123" },
    });
    expect(result.user.email).toBe("not-required@example.com");
  });

  it("does not enforce verification when SMTP is not configured, even if the env flag is true", async () => {
    delete process.env.SMTP_HOST;
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    const auth = await freshAuth();

    await runWithRegistrationAllowed(() =>
      auth.api.signUpEmail({
        body: {
          email: "no-smtp@example.com",
          password: "password123",
          name: "No SMTP",
        },
      }),
    );

    const result = await auth.api.signInEmail({
      body: { email: "no-smtp@example.com", password: "password123" },
    });
    expect(result.user.email).toBe("no-smtp@example.com");
  });
});
