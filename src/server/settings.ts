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
 * Returns the single instance_settings row, creating it lazily on first
 * access. `smtpEnabled` is derived from environment configuration, never
 * stored, since SMTP secrets live only in env.
 */
export async function getInstanceSettings(): Promise<InstanceSettings> {
  const existing = await db.select().from(instanceSettings).limit(1);
  const row = existing[0];

  if (row) {
    return {
      id: row.id,
      registrationMode: row.registrationMode,
      smtpEnabled: isSmtpConfigured(),
      emailVerificationRequired: row.emailVerificationRequired,
      telemetryEnabled: row.telemetryEnabled,
      instanceName: row.instanceName,
      maintenanceMode: row.maintenanceMode,
    };
  }

  const [created] = await db
    .insert(instanceSettings)
    .values({
      registrationMode: defaultRegistrationMode(),
      emailVerificationRequired:
        process.env.EMAIL_VERIFICATION_REQUIRED === "true",
      telemetryEnabled: process.env.TELEMETRY_ENABLED === "true",
    })
    .returning();

  return {
    id: created.id,
    registrationMode: created.registrationMode,
    smtpEnabled: isSmtpConfigured(),
    emailVerificationRequired: created.emailVerificationRequired,
    telemetryEnabled: created.telemetryEnabled,
    instanceName: created.instanceName,
    maintenanceMode: created.maintenanceMode,
  };
}

export async function updateInstanceSettings(
  patch: Partial<
    Pick<
      InstanceSettings,
      | "registrationMode"
      | "emailVerificationRequired"
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
        emailVerificationRequired: updated.emailVerificationRequired,
        telemetryEnabled: updated.telemetryEnabled,
        instanceName: updated.instanceName,
        maintenanceMode: updated.maintenanceMode,
      }
    : current;
}
