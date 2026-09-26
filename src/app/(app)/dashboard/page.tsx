import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getDashboardData } from "@/features/analytics/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import type { DashboardStudyCard } from "@/features/analytics/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StartStudyButton } from "@/components/analytics/start-study-button";
import { Sparkline } from "@/components/analytics/sparkline";

const MATURITY_LABEL: Record<string, string> = {
  NONE: "No history yet",
  EARLY: "Benchmark early",
  BUILDING: "Benchmark building",
  ESTABLISHED: "Benchmark established",
};

function studyCardLine(card: DashboardStudyCard): string {
  const { stats } = card;
  if (stats.eligibleCount === 0) {
    return `${stats.totalCount} case${stats.totalCount === 1 ? "" : "s"} so far · not yet included in your benchmark`;
  }
  if (stats.eligibleCount === 1 && card.latestFinishedAt) {
    const time = card.latestFinishedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Baseline started ${time} · 1 case`;
  }
  if (stats.recentPaceMs === null) {
    return `${stats.totalCount} case${stats.totalCount === 1 ? "" : "s"} · ${MATURITY_LABEL[stats.maturity]}`;
  }
  if (stats.comparisonPaceMs === null || stats.improvement === null) {
    return `Recent ${formatDuration(stats.recentPaceMs)} · ${stats.totalCount} timed reads · ${MATURITY_LABEL[stats.maturity]}`;
  }
  const pct = formatPercent(Math.abs(stats.improvement));
  const trendText =
    stats.improvement >= 0
      ? `↓ ${pct}% faster`
      : `↑ ${pct}% above your previous pace`;
  return `Recent ${formatDuration(stats.recentPaceMs)} · Previous ${formatDuration(stats.comparisonPaceMs)} · ${trendText} · ${stats.totalCount} timed reads · ${MATURITY_LABEL[stats.maturity]}`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(db, user.id);

  if (!data.hasAnyCases) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted">
          Your own history, measured against your own prior self — never
          compared to other radiologists.
        </p>
      </div>

      <section aria-label="Study performance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.studyCards.map((card) => (
            <Card key={card.studyTypeId}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link
                    href={`/analytics/${card.studyTypeId}`}
                    className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {card.studyName}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted">{studyCardLine(card)}</p>
                {card.sparkline.length >= 2 && (
                  <Sparkline points={card.sparkline} />
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/analytics/${card.studyTypeId}`}>
                      View details
                    </Link>
                  </Button>
                  <StartStudyButton
                    studyTypeId={card.studyTypeId}
                    size="sm"
                    variant="ghost"
                  >
                    Start this study
                  </StartStudyButton>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-label="Overview">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Completed cases
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {overview.completedCases}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Active reading time
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {formatDuration(overview.totalActiveMs)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Timed cases/hour
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {overview.timedCasesPerHour !== null
                  ? overview.timedCasesPerHour.toFixed(1)
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Reading-day streak
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {overview.readingDayStreak.current}
              </p>
              <p className="text-xs text-muted">
                Longest: {overview.readingDayStreak.longest} day
                {overview.readingDayStreak.longest === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-label="Personal records">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Personal records
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Fastest comparable read
              </p>
              <p className="text-lg font-semibold text-foreground">
                {data.personalRecords.fastestEligibleRead
                  ? formatDuration(
                      data.personalRecords.fastestEligibleRead.adjustedMs,
                    )
                  : "Not established yet"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Largest sustained improvement
              </p>
              <p className="text-lg font-semibold text-foreground">
                {data.personalRecords.largestSustainedImprovement
                  ? `${formatPercent(
                      data.personalRecords.largestSustainedImprovement
                        .improvement,
                    )}% faster`
                  : "Not established yet"}
              </p>
            </CardContent>
          </Card>
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
          <ul className="flex flex-col gap-2">
            {data.recentAchievements.map((a) => (
              <li key={`${a.key}-${a.studyTypeId ?? "global"}`}>
                <Card>
                  <CardContent className="flex flex-col gap-0.5 py-4">
                    <p className="text-sm font-medium text-foreground">
                      {a.title}
                      {a.studyName ? ` · ${a.studyName}` : ""}
                    </p>
                    <p className="text-xs text-muted">{a.description}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
