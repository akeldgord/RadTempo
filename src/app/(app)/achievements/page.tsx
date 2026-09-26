import Link from "next/link";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getAchievementsPageData } from "@/features/achievements/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";

export default async function AchievementsPage() {
  const user = await requireUser();
  const data = await getAchievementsPageData(db, user.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Achievements</h1>
        <p className="text-sm text-muted">
          Personal milestones from your own history — never a comparison to
          other radiologists.
        </p>
      </div>

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
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Study types with a benchmark
              </p>
              <p className="text-lg font-semibold text-foreground">
                {
                  Object.keys(data.personalRecords.bestRecentMedianByStudy)
                    .length
                }
              </p>
            </CardContent>
          </Card>
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
          <ul className="flex flex-col gap-2">
            {data.earned.map((a) => (
              <li
                key={`${a.key}-${a.studyTypeId ?? "global"}-${a.earnedAt.toISOString()}`}
              >
                <Card>
                  <CardContent className="flex items-start gap-3 py-4">
                    <Trophy
                      size={16}
                      className="mt-0.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {a.title}
                        {a.studyName ? ` · ${a.studyName}` : ""}
                      </p>
                      <p className="text-xs text-muted">{a.description}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted">
                      {a.earnedAt.toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
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
          <ul className="flex flex-col gap-2">
            {data.upcoming.map((m) => (
              <li key={`${m.key}-${m.studyTypeId ?? "global"}`}>
                <Card>
                  <CardContent className="flex flex-col gap-0.5 py-4">
                    <p className="text-sm font-medium text-foreground">
                      {m.title}
                      {m.studyName ? ` · ${m.studyName}` : ""}
                    </p>
                    <p className="text-xs text-muted">{m.progressText}</p>
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
