import { redirect } from "next/navigation";
import { ForbiddenError, requireAdmin } from "@/server/auth-helpers";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
      <p className="text-sm text-muted">
        Users, registration mode, invites, SMTP status, telemetry, backups, and
        instance health. The admin UI never shows any user&apos;s performance
        data.
      </p>
    </div>
  );
}
