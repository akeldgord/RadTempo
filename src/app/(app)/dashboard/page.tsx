import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getDashboardData } from "@/features/analytics/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import type { DashboardStudyCard } from "@/features/analytics/service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Viewport, ViewportGrid } from "@/components/viewport";
import { Caliper } from "@/components/caliper";
import { Duration } from "@/components/duration";

const achievementDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const MATURITY_LABEL: Record<string, string> = {
  NONE: "No history yet",
  EARLY: "Early",
  BUILDING: "Building",
  ESTABLISHED: "Established",
};

function readsLabel(count: number): string {
  return `${count} read${count === 1 ? "" : "s"}`;
}

/** The bottom-right overlay: an arrow + percent for a real comparison, or
 * "baseline forming" while there isn't one yet — text carries the meaning,
 * never color alone. */
function TrendNote({ stats }: { stats: DashboardStudyCard["stats"] }) {
  if (stats.totalCount === 1) {
    // SPEC: a single-case study shows its duration (bottom-left) and
    // "Baseline started", never a comparison.
    return <p className="text-xs text-muted">Baseline started, 1 case</p>;
  }
  if (stats.improvement === null || stats.comparisonPaceMs === null) {
    return <p className="text-xs text-muted">baseline forming</p>;
  }
  const pct = formatPercent(Math.abs(stats.improvement));
  const faster = stats.improvement >= 0;
  return (
    <p className="text-xs">
      <span className="font-mono tabular-nums text-caliper">
        {faster ? "↓" : "↑"} {pct}%
      </span>{" "}
      <span className="text-muted">
        {faster ? "faster than before" : "above your previous pace"}
      </span>
    </p>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(db, user.id);

  if (!data.hasAnyCases) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Dashboard"
          subtitle="Each study against your own prior pace."
        />
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm text-muted">
              No history yet. Your first timed read will start your personal
              baseline.
            </p>
            <Button asChild className="self-start">
              <Link href="/">Start a case</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overview } = data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        subtitle="Each study against your own prior pace."
        aside="Last 10 reads compared with the 20 before them"
      />

      <section aria-label="Study performance">
        <ViewportGrid>
          {data.studyCards.map((card) => {
            const { stats } = card;
            return (
              <Link
                key={card.studyTypeId}
                href={`/analytics/${card.studyTypeId}`}
                className="group focus-visible:outline-none"
              >
                <Viewport
                  className="h-full transition-colors group-hover:bg-muted-bg group-focus-visible:bg-muted-bg group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-ring"
                  topLeft={card.studyName}
                  topRight={
                    <>
                      {readsLabel(stats.totalCount)}
                      <br />
                      {MATURITY_LABEL[stats.maturity]}
                    </>
                  }
                  bottomLeft={
                    stats.recentPaceMs !== null ? (
                      <>
                        <Duration className="text-3xl font-medium">
                          {formatDuration(stats.recentPaceMs)}
                        </Duration>
                        <p className="mt-1 text-2xs text-muted">recent pace</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted">
                        {stats.totalCount} case
                        {stats.totalCount === 1 ? "" : "s"} so far
                      </p>
                    )
                  }
                  bottomRight={<TrendNote stats={stats} />}
                >
                  {stats.recentPaceMs !== null && (
                    <Caliper
                      className="w-full"
                      recentMs={stats.recentPaceMs}
                      previousMs={stats.comparisonPaceMs}
                      formatDuration={formatDuration}
                    />
                  )}
                </Viewport>
              </Link>
            );
          })}
        </ViewportGrid>
      </section>

      <section
        aria-label="Overview"
        className="flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-5"
      >
        <div>
          <Duration className="block text-lg font-medium">
            {overview.completedCases}
          </Duration>
          <p className="text-xs text-muted">completed reads</p>
        </div>
        <div>
          <Duration className="block text-lg font-medium">
            {formatDuration(overview.totalActiveMs)}
          </Duration>
          <p className="text-xs text-muted">active reading time</p>
        </div>
        <div>
          <Duration className="block text-lg font-medium">
            {overview.timedCasesPerHour !== null
              ? overview.timedCasesPerHour.toFixed(1)
              : "—"}
          </Duration>
          <p className="text-xs text-muted">timed reads per hour</p>
        </div>
        <div>
          <Duration className="block text-lg font-medium">
            {overview.readingDayStreak.current} day
            {overview.readingDayStreak.current === 1 ? "" : "s"}
          </Duration>
          <p className="text-xs text-muted">
            reading streak
            <br />
            longest {overview.readingDayStreak.longest} day
            {overview.readingDayStreak.longest === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      <section
        aria-label="Personal records"
        className="flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-5"
      >
        <div>
          <Duration className="block text-lg font-medium">
            {data.personalRecords.fastestEligibleRead
              ? formatDuration(
                  data.personalRecords.fastestEligibleRead.adjustedMs,
                )
              : "—"}
          </Duration>
          <p className="text-xs text-muted">fastest comparable read</p>
        </div>
        <div>
          <Duration className="block text-lg font-medium">
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
      </section>

      <section aria-label="Achievements preview">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Recent achievements
          </h2>
          <Link
            href="/achievements"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {data.recentAchievements.length === 0 ? (
          <p className="text-sm text-muted">
            No achievements yet — they will appear here as you build a history.
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul>
              {data.recentAchievements.map((a) => (
                <li
                  key={`${a.key}-${a.studyTypeId ?? "global"}`}
                  className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-0 sm:px-5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {a.title}
                      {a.studyName ? ` for ${a.studyName}` : ""}
                    </p>
                    <p className="text-xs text-muted">{a.description}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted">
                    {achievementDateFormatter.format(a.earnedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
