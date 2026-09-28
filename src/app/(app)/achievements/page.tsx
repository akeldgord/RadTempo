import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getAchievementsPageData } from "@/features/achievements/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import { PageHeader } from "@/components/page-header";
import { Duration } from "@/components/duration";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Parses "X of Y ..." progress text into a ratio for the ruled progress
 * row, without changing what the text itself says. */
function progressRatio(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s+of\s+(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(value) || !total) return null;
  return Math.min(1, value / total);
}

export default async function AchievementsPage() {
  const user = await requireUser();
  const data = await getAchievementsPageData(db, user.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Achievements"
        subtitle="Personal milestones from your own history — never a comparison to other radiologists."
      />

      <section
        aria-label="Personal records"
        className="flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-5"
      >
        <div>
          <Duration className="block text-2xl font-medium">
            {data.personalRecords.fastestEligibleRead
              ? formatDuration(
                  data.personalRecords.fastestEligibleRead.adjustedMs,
                )
              : "—"}
          </Duration>
          <p className="text-xs text-muted">fastest comparable read</p>
        </div>
        <div>
          <Duration className="block text-2xl font-medium">
            {data.personalRecords.largestSustainedImprovement
              ? `↓ ${formatPercent(
                  data.personalRecords.largestSustainedImprovement.improvement,
                )}%`
              : "—"}
          </Duration>
          <p className="text-xs text-muted">
            {data.personalRecords.largestSustainedImprovement
              ? "largest sustained improvement"
              : "no sustained improvement yet"}
          </p>
        </div>
        <div>
          <Duration className="block text-2xl font-medium">
            {Object.keys(data.personalRecords.bestRecentMedianByStudy).length}
          </Duration>
          <p className="text-xs text-muted">study types with a benchmark</p>
        </div>
      </section>

      <section aria-label="Earned achievements">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Earned</h2>
        {data.earned.length === 0 ? (
          <p className="text-sm text-muted">
            No achievements yet.{" "}
            <Link href="/" className="text-primary underline">
              Start a timed case
            </Link>{" "}
            to begin your history.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {data.earned.map((a) => (
              <li
                key={`${a.key}-${a.studyTypeId ?? "global"}-${a.earnedAt.toISOString()}`}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {a.title}
                    {a.studyName ? ` for ${a.studyName}` : ""}
                  </p>
                  <p className="text-xs text-muted">{a.description}</p>
                </div>
                <p className="shrink-0 text-xs text-muted">
                  {dateFormatter.format(a.earnedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Upcoming milestones">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Upcoming milestones
        </h2>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-muted">
            You&apos;ve reached every upcoming milestone we track right now.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {data.upcoming.map((m) => {
              const ratio = progressRatio(m.progressText);
              return (
                <li
                  key={`${m.key}-${m.studyTypeId ?? "global"}`}
                  className="py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {m.title}
                    {m.studyName ? ` for ${m.studyName}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{m.progressText}</p>
                  {ratio !== null && (
                    <div
                      className="mt-2 h-1 w-full max-w-sm border-b border-border"
                      aria-hidden="true"
                    >
                      <div
                        className="h-1 border-b-2 border-caliper"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
