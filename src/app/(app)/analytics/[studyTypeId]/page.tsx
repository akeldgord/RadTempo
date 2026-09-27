import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getStudyAnalytics } from "@/features/analytics/service";
import { formatDuration, formatPercent } from "@/features/analytics/engine";
import { NotFoundError } from "@/server/errors";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Duration } from "@/components/duration";
import { CaliperPanel } from "@/components/analytics/caliper-panel";
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

const fieldClass =
  "h-9 rounded-md border border-input-border bg-card px-2 text-sm text-foreground";

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
          <PageHeader
            className="mt-1"
            title={data.studyName}
            subtitle="Personal benchmark for this study type. Always computed from all of your eligible history, regardless of the filters below."
          />
        </div>
        <StartStudyButton studyTypeId={data.studyTypeId} />
      </div>

      <section
        aria-label="Benchmark"
        className="rounded-lg border border-border bg-card p-5 sm:p-6"
      >
        {stats.recentPaceMs !== null ? (
          <CaliperPanel
            className="mb-8 w-full"
            size="lg"
            recentMs={stats.recentPaceMs}
            previousMs={stats.comparisonPaceMs}
          />
        ) : (
          <p className="mb-6 text-sm text-muted">
            {MATURITY_LABEL[stats.maturity]} — not enough history yet to draw a
            measurement.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Benchmark (recent pace)</dt>
            <dd>
              <Duration className="text-2xl font-medium">
                {stats.benchmarkMs !== null
                  ? formatDuration(stats.benchmarkMs)
                  : "—"}
              </Duration>
              <p className="text-2xs text-muted">
                {MATURITY_LABEL[stats.maturity]}
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Previous pace</dt>
            <dd>
              <Duration className="text-2xl font-medium">
                {stats.comparisonPaceMs !== null
                  ? formatDuration(stats.comparisonPaceMs)
                  : "—"}
              </Duration>
              {stats.improvement !== null && (
                <p className="text-2xs text-caliper">
                  {stats.improvement >= 0
                    ? `↓ ${formatPercent(stats.improvement)}% faster`
                    : `↑ ${formatPercent(Math.abs(stats.improvement))}% above`}
                </p>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Personal best (adjusted)</dt>
            <dd>
              <Duration className="text-2xl font-medium">
                {stats.personalBestMs.adjusted !== null
                  ? formatDuration(stats.personalBestMs.adjusted)
                  : "—"}
              </Duration>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Timed cases/hour</dt>
            <dd>
              <Duration className="text-2xl font-medium">
                {stats.casesPerHour !== null
                  ? stats.casesPerHour.toFixed(1)
                  : "—"}
              </Duration>
              <p className="text-2xs text-muted">
                {stats.totalCount} total, {stats.eligibleCount} comparable
                {stats.excludedCount > 0
                  ? `, ${stats.excludedCount} excluded`
                  : ""}
              </p>
            </dd>
          </div>
        </dl>

        {data.personalPercentile !== null && (
          <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
            Faster than {formatPercent(data.personalPercentile)}% of your prior
            comparable reads.
          </p>
        )}
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
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">From</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">To</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Complexity</span>
            <select
              name="complexity"
              defaultValue={sp.complexity ?? ""}
              className={fieldClass}
            >
              <option value="">Any</option>
              <option value="EASY">Easy</option>
              <option value="TYPICAL">Typical</option>
              <option value="DIFFICULT">Difficult</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Included</span>
            <select
              name="included"
              defaultValue={sp.included ?? ""}
              className={fieldClass}
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
              className={fieldClass}
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
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Recent cases for {data.studyName}
              </caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-2 pl-3 pr-4 font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Raw
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Adjusted
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Complexity
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Tags
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Percentile
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentCases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2 pl-3 pr-4 text-foreground">
                      {c.finishedAt.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <Duration className="text-foreground">
                        {formatDuration(c.rawDurationMs)}
                      </Duration>
                    </td>
                    <td className="py-2 pr-4">
                      <Duration className="text-foreground">
                        {formatDuration(c.adjustedDurationMs)}
                      </Duration>
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {c.complexity}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {c.tagNames.length > 0 ? c.tagNames.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-4 text-foreground">
                      {c.excluded ? (
                        <span className="text-muted">
                          Excluded
                          {c.excludingTagNames.length > 0
                            ? ` (${c.excludingTagNames.join(", ")})`
                            : ""}
                        </span>
                      ) : (
                        "Included"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-foreground">
                      {c.personalPercentile !== null
                        ? `Faster than ${formatPercent(c.personalPercentile)}%`
                        : "—"}
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
