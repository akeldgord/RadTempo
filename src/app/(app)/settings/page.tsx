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
import { PageHeader } from "@/components/page-header";
import { Section } from "./section";

export default async function SettingsPage() {
  const user = await requireUser();
  const [preferences, tags] = await Promise.all([
    getPreferences(db, user.id),
    listTags(db, user.id),
  ]);

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Settings"
        subtitle="Theme, timer visibility, keyboard shortcuts, and account options."
        className="pb-6"
      />

      <ThemeSection initialTheme={preferences.theme} />
      <TimerVisibilitySection initialVisibility={preferences.timerVisibility} />
      <ShortcutsSection initialShortcuts={preferences.keyboardShortcuts} />
      <TagsSection initialTags={tags} />
      <PasswordSection />

      <Section title="Data">
        <Link href="/settings/data" className="text-sm text-primary underline">
          Import / export your data
        </Link>
        <Link
          href="/settings/data#delete-account"
          className="text-sm text-danger underline"
        >
          Delete my account
        </Link>
      </Section>
    </div>
  );
}
