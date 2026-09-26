import { redirect } from "next/navigation";
import { ForbiddenError, requireAdmin } from "@/server/auth-helpers";
import { getInstanceSettings } from "@/server/settings";
import { listPendingInvites, listUsers } from "@/features/admin/users";
import { TELEMETRY_FIELDS } from "@/features/admin/telemetry";
import {
  checkDatabaseConnected,
  getAppVersion,
  getDatabaseSizeBytes,
  getMigrationStatus,
} from "@/features/admin/system";
import { UsersSection } from "./users-section";
import { RegistrationSection } from "./registration-section";
import { EmailSection } from "./email-section";
import { BackupSection } from "./backup-section";
import { TelemetrySection } from "./telemetry-section";
import { SystemSection } from "./system-section";

export default async function AdminPage() {
  let currentAdminId: string;
  try {
    const admin = await requireAdmin();
    currentAdminId = admin.id;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    redirect("/login");
  }

  const [users, invites, settings, dbConnected, migrations, dbSizeBytes] =
    await Promise.all([
      listUsers(),
      listPendingInvites(),
      getInstanceSettings(),
      checkDatabaseConnected(),
      getMigrationStatus(),
      getDatabaseSizeBytes(),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
        <p className="mt-1 text-sm text-muted">
          Account management, instance settings, and backups. The admin UI never
          shows any user&apos;s performance or timing data.
        </p>
      </div>

      <UsersSection
        users={users}
        invites={invites}
        currentAdminId={currentAdminId}
        appUrl={process.env.APP_URL ?? "http://localhost:3000"}
      />

      <RegistrationSection registrationMode={settings.registrationMode} />

      <EmailSection
        smtpEnabled={settings.smtpEnabled}
        smtpHost={process.env.SMTP_HOST ?? null}
        emailVerificationRequired={settings.emailVerificationRequired}
      />

      <BackupSection />

      <TelemetrySection
        telemetryEnabled={settings.telemetryEnabled}
        fields={TELEMETRY_FIELDS}
      />

      <SystemSection
        appVersion={getAppVersion()}
        dbConnected={dbConnected}
        migrations={migrations}
        dbSizeBytes={dbSizeBytes}
        maintenanceMode={settings.maintenanceMode}
      />
    </div>
  );
}
