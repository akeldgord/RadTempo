import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { user as userTable } from "@/db/schema";
import { sendMail } from "@/server/mailer";
import { isEmailVerificationRequired } from "@/server/settings";
import { isRegistrationAllowedInCurrentContext } from "@/server/registration-gate";

async function userCount(): Promise<number> {
  const rows = await db.select({ value: count() }).from(userTable);
  return rows[0]?.value ?? 0;
}

// EMAIL_VERIFICATION_REQUIRED is the single source of truth for whether
// email verification is enforced (no DB setting is consulted here) — and
// it only takes effect when SMTP is configured, since verification mail
// cannot be sent otherwise. Computed once at module load, matching Better
// Auth's own config-at-construction model. See docs/SPEC.md "Auth &
// accounts".
const emailVerificationRequired = isEmailVerificationRequired();

export const auth = betterAuth({
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret: process.env.AUTH_SECRET,
  trustedOrigins: process.env.APP_URL ? [process.env.APP_URL] : undefined,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: emailVerificationRequired,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your RadTempo password",
        text: `Reset your password: ${url}\n\nIf you did not request this, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: emailVerificationRequired,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your RadTempo email",
        text: `Verify your email address: ${url}`,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
        defaultValue: "USER",
      },
      disabledAt: {
        type: "date",
        required: false,
        input: false,
      },
      onboardedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    // General ceiling across all other Better Auth endpoints for a given
    // IP (session checks, sign-out, etc.) — left at Better Auth's own
    // default rather than tightened further, since the security-relevant
    // control the SPEC calls for is the login rate limit below.
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    database: {
      generateId: false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const existingUsers = await userCount();
          const isFirstUser = existingUsers === 0;

          if (!isFirstUser && !isRegistrationAllowedInCurrentContext()) {
            return false;
          }

          return {
            data: {
              ...data,
              role: isFirstUser ? "ADMIN" : "USER",
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const disabled = await isUserDisabled(session.userId);
          if (disabled) {
            return false;
          }
        },
      },
    },
  },
});

/**
 * Fetches the disabled-at flag directly (Better Auth's own APIs do not
 * surface arbitrary additional fields on every response path).
 */
export async function isUserDisabled(userId: string): Promise<boolean> {
  const rows = await db
    .select({ disabledAt: userTable.disabledAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return rows[0]?.disabledAt != null;
}
