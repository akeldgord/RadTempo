import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instanceSettings } from "@/db/schema";
import { isSmtpConfigured } from "@/server/mailer";

export type RegistrationMode = "invite_only" | "open";

export type InstanceSettings = {
  id: string;
  registrationMode: RegistrationMode;
  smtpEnabled: boolean;
  emailVerificationRequired: boolean;
  telemetryEnabled: boolean;
  instanceName: string;
  maintenanceMode: boolean;
};

function defaultRegistrationMode(): RegistrationMode {
  const env = process.env.REGISTRATION_MODE;
  return env === "open" ? "open" : "invite_only";
}

/**
 * Whether email verification is actually enforced: EMAIL_VERIFICATION_REQUIRED
 * is the single source of truth (no DB setting is consulted — see
 * `src/lib/auth.ts` and docs/SPEC.md "Auth & accounts"), and it only takes
 * effect when SMTP is configured, since verification mail cannot be sent
 * otherwise.
 */
export function isEmailVerificationRequired(): boolean {
  return (
    process.env.EMAIL_VERIFICATION_REQUIRED === "true" && isSmtpConfigured()
  );
}

/**
 * Returns the single instance_settings row, creating it lazily on first
 * access. `smtpEnabled` is derived from environment configuration, never
 * stored, since SMTP secrets live only in env. `emailVerificationRequired`
 * is likewise derived from environment configuration (never the DB row,
 * which stays dormant) — see `isEmailVerificationRequired`.
 */
export async function getInstanceSettings(): Promise<InstanceSettings> {
  const existing = await db.select().from(instanceSettings).limit(1);
  const row = existing[0];

  if (row) {
    return {
      id: row.id,
      registrationMode: row.registrationMode,
      smtpEnabled: isSmtpConfigured(),
      emailVerificationRequired: isEmailVerificationRequired(),
      telemetryEnabled: row.telemetryEnabled,
      instanceName: row.instanceName,
      maintenanceMode: row.maintenanceMode,
    };
  }

  const [created] = await db
    .insert(instanceSettings)
    .values({
      registrationMode: defaultRegistrationMode(),
      telemetryEnabled: process.env.TELEMETRY_ENABLED === "true",
    })
    .returning();

  return {
    id: created.id,
    registrationMode: created.registrationMode,
    smtpEnabled: isSmtpConfigured(),
    emailVerificationRequired: isEmailVerificationRequired(),
    telemetryEnabled: created.telemetryEnabled,
    instanceName: created.instanceName,
    maintenanceMode: created.maintenanceMode,
  };
}

export class MaintenanceModeError extends Error {
  constructor(message = "The instance is in maintenance mode") {
    super(message);
    this.name = "MaintenanceModeError";
  }
}

/**
 * Throws `MaintenanceModeError` while the instance is in maintenance mode.
 * Features call this at the top of their mutations so a restore-in-progress
 * (or an admin-flagged maintenance window) blocks writes. The restore flow
 * itself never calls this, since it is what puts the instance into and out
 * of maintenance mode.
 */
export async function assertNotMaintenance(): Promise<void> {
  const settings = await getInstanceSettings();
  if (settings.maintenanceMode) {
    throw new MaintenanceModeError();
  }
}

export async function updateInstanceSettings(
  patch: Partial<
    Pick<
      InstanceSettings,
      | "registrationMode"
      | "telemetryEnabled"
      | "instanceName"
      | "maintenanceMode"
    >
  >,
): Promise<InstanceSettings> {
  const current = await getInstanceSettings();

  const [updated] = await db
    .update(instanceSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(instanceSettings.id, current.id))
    .returning();

  return updated
    ? {
        id: updated.id,
        registrationMode: updated.registrationMode,
        smtpEnabled: isSmtpConfigured(),
        emailVerificationRequired: isEmailVerificationRequired(),
        telemetryEnabled: updated.telemetryEnabled,
        instanceName: updated.instanceName,
        maintenanceMode: updated.maintenanceMode,
      }
    : current;
}
