import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/server/setup-status";
import { getCurrentUser } from "@/server/auth-helpers";
import { getInstanceSettings } from "@/server/settings";
import { db } from "@/db";
import { getActiveTimer } from "@/features/timer/service";
import { getPreferences } from "@/features/preferences/service";
import { getHomeSections } from "@/features/studies/service";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { TimerProvider } from "@/components/timer/timer-context";
import { TimerBar } from "@/components/timer/timer-bar";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts-provider";

// Every page under this layout is per-user and reads the database; never
// prerender at build time (the build has no database).
export const dynamic = "force-dynamic";

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

  if (!user.onboardedAt) {
    redirect("/onboarding");
  }

  const { maintenanceMode } = await getInstanceSettings();
  const [activeTimer, preferences, homeSections] = await Promise.all([
    getActiveTimer(db, user.id),
    getPreferences(db, user.id),
    getHomeSections(db, user.id),
  ]);

  return (
    <TimerProvider
      initialTimer={activeTimer}
      initialTimerVisibility={preferences.timerVisibility}
    >
      <KeyboardShortcutsProvider
        initialShortcuts={preferences.keyboardShortcuts}
        favorites={homeSections.favorites}
      >
        <div className="flex min-h-screen min-w-0">
          <Sidebar isAdmin={user.role === "ADMIN"} className="hidden md:flex" />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav isAdmin={user.role === "ADMIN"} />
            <header className="hidden h-14 items-center justify-end gap-4 border-b border-border bg-card px-6 md:flex">
              <span className="text-sm text-muted">{user.email}</span>
              <SignOutButton />
            </header>
            {maintenanceMode && (
              <div
                role="status"
                className="border-b border-border bg-danger/10 px-6 py-2 text-sm font-medium text-danger"
              >
                Maintenance mode is on. A restore may be in progress; some
                actions may be temporarily unavailable.
              </div>
            )}
            <TimerBar />
            <main className="min-w-0 flex-1 bg-background px-4 py-8 sm:px-6">
              {children}
            </main>
          </div>
        </div>
      </KeyboardShortcutsProvider>
    </TimerProvider>
  );
}
