import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getPreferences } from "@/features/preferences/service";
import { listTags } from "@/features/tags/service";
import { ThemeSection } from "./theme-section";
import { TimerVisibilitySection } from "./timer-visibility-section";
import { ShortcutsSection } from "./shortcuts-section";
import { TagsSection } from "./tags-section";
import { PasswordSection } from "./password-section";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const user = await requireUser();
  const [preferences, tags] = await Promise.all([
    getPreferences(db, user.id),
    listTags(db, user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted">
          Theme, timer visibility, keyboard shortcuts, and account options.
        </p>
      </div>

      <ThemeSection initialTheme={preferences.theme} />
      <TimerVisibilitySection initialVisibility={preferences.timerVisibility} />
      <ShortcutsSection initialShortcuts={preferences.keyboardShortcuts} />
      <TagsSection initialTags={tags} />
      <PasswordSection />

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          <Link
            href="/settings/data"
            className="text-sm text-primary underline"
          >
            Import / export your data
          </Link>
          <Link
            href="/settings/data#delete-account"
            className="text-sm text-danger underline"
          >
            Delete my account
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
