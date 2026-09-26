import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/server/setup-status";
import { getCurrentUser } from "@/server/auth-helpers";
import { getInstanceSettings } from "@/server/settings";
import { Sidebar } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { maintenanceMode } = await getInstanceSettings();

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b border-border bg-card px-6">
          <span className="text-sm text-muted">{user.email}</span>
          <SignOutButton />
        </header>
        {maintenanceMode && (
          <div
            role="status"
            className="border-b border-border bg-danger/10 px-6 py-2 text-sm font-medium text-danger"
          >
            Maintenance mode is on. A restore may be in progress; some actions
            may be temporarily unavailable.
          </div>
        )}
        <main className="flex-1 bg-background px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
