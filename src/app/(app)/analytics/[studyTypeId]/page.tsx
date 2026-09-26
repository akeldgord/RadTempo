import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getStudyAnalytics } from "@/features/analytics/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import { NotFoundError } from "@/server/errors";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StartStudyButton } from "@/components/analytics/start-study-button";
import { TrendChart } from "@/components/analytics/trend-chart";
import { ComplexityDistributionBars } from "@/components/analytics/complexity-distribution";

const MATURITY_LABEL: Record<string, string> = {
  NONE: "No history yet",
  EARLY: "Early",
  BUILDING: "Building",
  ESTABLISHED: "Established",
};

interface SearchParams {
  from?: string;
  to?: string;
  complexity?: string;
  included?: string;
  tagId?: string;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function StudyAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyTypeId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const { studyTypeId } = await params;
  const sp = await searchParams;

  const complexity =
    sp.complexity === "EASY" ||
    sp.complexity === "TYPICAL" ||
    sp.complexity === "DIFFICULT"
      ? sp.complexity
      : undefined;
  const included =
    sp.included === "true" ? true : sp.included === "false" ? false : undefined;

  let data;
  try {
    data = await getStudyAnalytics(db, user.id, studyTypeId, {
      from: parseDate(sp.from),
      to: parseDate(sp.to),
      complexity,
      included,
      tagId: sp.tagId || undefined,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { stats } = data;
  const filtersActive = Boolean(
    sp.from || sp.to || complexity || sp.included || sp.tagId,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-primary hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {data.studyName}
          </h1>
          <p className="text-sm text-muted">
            Personal benchmark for this study type. Always computed from all of
            your eligible history, regardless of the filters below.
          </p>
        </div>
        <StartStudyButton studyTypeId={data.studyTypeId} />
      </div>

      <section
        aria-label="Benchmark"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted">
              Personal benchmark (recent pace)
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.benchmarkMs !== null
                ? formatDuration(stats.benchmarkMs)
                : "—"}
            </p>
            <p className="text-xs text-muted">
              {MATURITY_LABEL[stats.maturity]}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted">
              Previous pace
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.comparisonPaceMs !== null
                ? formatDuration(stats.comparisonPaceMs)
                : "—"}
            </p>
            {stats.improvement !== null && (
              <p className="text-xs text-muted">
                {stats.improvement >= 0
                  ? `${formatPercent(stats.improvement)}% faster than previous pace`
                  : `${formatPercent(Math.abs(stats.improvement))}% above previous pace`}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted">
              Personal best (adjusted)
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.personalBestMs.adjusted !== null
                ? formatDuration(stats.personalBestMs.adjusted)
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted">
              Timed cases/hour
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.casesPerHour !== null
                ? stats.casesPerHour.toFixed(1)
                : "—"}
            </p>
            <p className="text-xs text-muted">
              {stats.totalCount} total · {stats.eligibleCount} comparable
              {stats.excludedCount > 0
                ? ` · ${stats.excludedCount} excluded`
                : ""}
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Raw and complexity-adjusted trend">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Raw vs. complexity-adjusted trend
        </h2>
        {Object.values(data.complexityFactors).some((f) => f.provisional) && (
          <p className="mb-3 text-xs text-muted">
            Some complexity factors are still provisional (fewer than 5
            comparable cases at that complexity) — those cases use a 1.0 (no-op)
            adjustment until more history is available.
          </p>
        )}
        <TrendChart points={data.trend} />
      </section>

      <section aria-label="Complexity distribution" className="max-w-md">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Easy / Typical / Difficult
        </h2>
        <ComplexityDistributionBars
          distribution={stats.complexityDistribution}
        />
      </section>

      <section aria-label="Filters">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Filter recent cases &amp; trend
        </h2>
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">From</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">To</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Complexity</span>
            <select
              name="complexity"
              defaultValue={sp.complexity ?? ""}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value="">Any</option>
              <option value="EASY">Easy</option>
              <option value="TYPICAL">Typical</option>
              <option value="DIFFICULT">Difficult</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Included in benchmark</span>
            <select
              name="included"
              defaultValue={sp.included ?? ""}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value="">Any</option>
              <option value="true">Included only</option>
              <option value="false">Excluded only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Tag</span>
            <select
              name="tagId"
              defaultValue={sp.tagId ?? ""}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value="">Any</option>
              {data.availableTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
          {filtersActive && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/analytics/${data.studyTypeId}`}>Clear</Link>
            </Button>
          )}
        </form>
      </section>

      <section aria-label="Recent cases">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Recent cases
          {filtersActive
            ? ` (filtered — ${data.filteredCount} match${data.filteredCount === 1 ? "" : "es"})`
            : ""}
        </h2>
        {data.recentCases.length === 0 ? (
          <p className="text-sm text-muted">
            No cases match these filters yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Duration (raw)
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Duration (adjusted)
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Complexity
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Tags
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Included?
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentCases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2 pr-4 text-foreground">
                      {c.finishedAt.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {formatDuration(c.rawDurationMs)}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {formatDuration(c.adjustedDurationMs)}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {c.complexity}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {c.tagNames.length > 0 ? c.tagNames.join(", ") : "—"}
                    </td>
                    <td className="py-2 text-foreground">
                      {c.excluded
                        ? `Excluded${c.excludingTagNames.length > 0 ? ` (${c.excludingTagNames.join(", ")})` : ""}`
                        : "Included"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
