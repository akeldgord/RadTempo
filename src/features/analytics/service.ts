/**
 * Server-only analytics service: composes the pure engine
 * (`src/features/analytics/engine.ts`) with Postgres data for the
 * Dashboard and Study detail screens. See docs/SPEC.md, sections
 * "Analytics", "Dashboard", and "Study detail", and docs/analytics.md.
 */

import { and, desc, eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  achievementEvents,
  tags as tagsTable,
  userStudyTypes,
} from "@/db/schema";
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementKey,
} from "@/features/achievements/definitions";
import {
  personalRecords,
  type PersonalRecords,
} from "@/features/achievements/evaluate";
import { NotFoundError } from "@/server/errors";
import {
  computeComplexityFactors,
  computeOverview,
  computeStudyStats,
  computeTrend,
  MIN_STUDY_N,
  personalPercentile as personalPercentileEngine,
} from "./engine";
import { loadUserCases } from "./repository";
import type {
  CaseRecord,
  Complexity,
  ComplexityFactors,
  OverviewStats,
  StudyStats,
  TrendPoint,
} from "./types";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStudyCard {
  studyTypeId: string;
  studyName: string;
  shortName: string;
  stats: StudyStats;
  /** Weekly adjusted-median trend, all eligible history — used for the
   * card's small sparkline. Empty when there is no eligible history yet. */
  sparkline: TrendPoint[];
  /** `finished_at` of this study's most recent case, e.g. for the
   * single-case "Baseline started 07:14" empty state. */
  latestFinishedAt: Date | null;
}

export interface RecentAchievement {
  key: AchievementKey;
  title: string;
  description: string;
  earnedAt: Date;
  studyTypeId: string | null;
  studyName: string | null;
}

export interface DashboardData {
  overview: OverviewStats;
  hasAnyCases: boolean;
  studyCards: DashboardStudyCard[];
  personalRecords: PersonalRecords;
  recentAchievements: RecentAchievement[];
}

const RECENT_ACHIEVEMENTS_LIMIT = 5;

async function loadStudyNames(
  db: DbClient,
  userId: string,
): Promise<Map<string, { name: string; shortName: string }>> {
  const rows = await db
    .select({
      id: userStudyTypes.id,
      name: userStudyTypes.name,
      shortName: userStudyTypes.shortName,
    })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  return new Map(
    rows.map((r) => [r.id, { name: r.name, shortName: r.shortName }]),
  );
}

function groupByStudy(cases: CaseRecord[]): Map<string, CaseRecord[]> {
  const byStudy = new Map<string, CaseRecord[]>();
  for (const c of cases) {
    const list = byStudy.get(c.studyTypeId);
    if (list) list.push(c);
    else byStudy.set(c.studyTypeId, [c]);
  }
  return byStudy;
}

/**
 * Everything the Dashboard needs, computed from Postgres (no caching —
 * cheap enough at V1 scale per SPEC). Study cards are sorted by case count
 * (most-worked-on first) and only include study types with >= 1 COMPLETED
 * case (no zero-filled cards for never-started study types).
 */
export async function getDashboardData(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<DashboardData> {
  const allCases = await loadUserCases(db, userId);
  const overview = computeOverview(allCases, now);
  const factors = computeComplexityFactors(allCases);
  const namesById = await loadStudyNames(db, userId);

  const byStudy = groupByStudy(allCases);
  const statsByStudy: Record<string, StudyStats> = {};
  const studyCards: DashboardStudyCard[] = [];

  for (const [studyTypeId, cases] of byStudy) {
    const stats = computeStudyStats(cases, factors);
    statsByStudy[studyTypeId] = stats;
    const names = namesById.get(studyTypeId);
    if (!names) continue; // study type was deleted; case history remains but has no card
    const latestFinishedAt = cases.reduce<Date | null>(
      (latest, c) =>
        latest === null || c.finishedAt > latest ? c.finishedAt : latest,
      null,
    );
    studyCards.push({
      studyTypeId,
      studyName: names.name,
      shortName: names.shortName,
      stats,
      sparkline: computeTrend(cases, factors, "week"),
      latestFinishedAt,
    });
  }

  studyCards.sort((a, b) => b.stats.totalCount - a.stats.totalCount);

  const records = personalRecords(allCases, statsByStudy, factors);

  const achievementRows = await db
    .select()
    .from(achievementEvents)
    .where(eq(achievementEvents.userId, userId))
    .orderBy(desc(achievementEvents.earnedAt))
    .limit(RECENT_ACHIEVEMENTS_LIMIT);

  const recentAchievements: RecentAchievement[] = achievementRows.map((r) => {
    const def = ACHIEVEMENT_DEFINITIONS[r.achievementKey as AchievementKey];
    const studyNames = r.studyTypeId ? namesById.get(r.studyTypeId) : undefined;
    return {
      key: r.achievementKey as AchievementKey,
      title: def?.title ?? r.achievementKey,
      description: def?.description ?? "",
      earnedAt: r.earnedAt,
      studyTypeId: r.studyTypeId,
      studyName: studyNames?.name ?? null,
    };
  });

  return {
    overview,
    hasAnyCases: allCases.length > 0,
    studyCards,
    personalRecords: records,
    recentAchievements,
  };
}

// ---------------------------------------------------------------------------
// Study detail
// ---------------------------------------------------------------------------

export interface StudyAnalyticsFilters {
  from?: Date;
  to?: Date;
  complexity?: Complexity;
  /** true = only cases included in the benchmark; false = only excluded
   * ones; undefined = both. */
  included?: boolean;
  tagId?: string;
}

export interface RecentCaseRow {
  id: string;
  finishedAt: Date;
  rawDurationMs: number;
  adjustedDurationMs: number;
  complexity: Complexity;
  excluded: boolean;
  /** Names of tags with exclude_from_benchmark = true attached to this
   * case, e.g. ["Interrupted"] — rendered as a text label, never
   * color-only. Empty for an included case. */
  excludingTagNames: string[];
  tagNames: string[];
  /** Fraction of the user's prior eligible adjusted reads of this same
   * study that this read was faster than. Null when fewer than
   * MIN_PERCENTILE_PRIOR_N prior eligible cases exist. Never a
   * population/peer comparison — always this user's own history. */
  personalPercentile: number | null;
}

export interface StudyAnalyticsData {
  studyTypeId: string;
  studyName: string;
  shortName: string;
  /** Always computed over ALL eligible cases regardless of filters — the
   * benchmark, recent/previous pace, maturity, personal best, and cases/hour
   * never change based on the displayed-case filters. */
  stats: StudyStats;
  complexityFactors: ComplexityFactors;
  /** Weekly raw & adjusted median trend, computed over the filtered cases. */
  trend: TrendPoint[];
  /** Most recent 20 filtered cases, newest first. */
  recentCases: RecentCaseRow[];
  /** Total case count matching the filters (before the 20-row cap). */
  filteredCount: number;
  availableTags: { id: string; name: string; excludeFromBenchmark: boolean }[];
  /** Personal percentile for the most recent completed eligible case of
   * this study, vs. only its own prior eligible cases. Null when there
   * is no eligible case yet or fewer than MIN_PERCENTILE_PRIOR_N priors.
   * Never a population/peer comparison. */
  personalPercentile: number | null;
}

const RECENT_CASES_LIMIT = 20;

/**
 * Minimum number of PRIOR eligible cases of the same study required before
 * a personal percentile is shown at all (below this the sample is too thin
 * to be meaningful) — reuses the engine's benchmark-maturity threshold.
 * See docs/SPEC.md "Analytics" (personal percentile).
 */
const MIN_PERCENTILE_PRIOR_N = MIN_STUDY_N;

/**
 * Personal percentile for `target` against only the cases of the same
 * study that finished strictly before it (never the case itself, never
 * later cases). Excluded-tag priors are dropped by the engine itself.
 * Null when fewer than MIN_PERCENTILE_PRIOR_N eligible priors exist.
 */
function personalPercentileForCase(
  target: CaseRecord,
  sortedStudyCasesAsc: CaseRecord[],
  factors: ComplexityFactors,
): number | null {
  const idx = sortedStudyCasesAsc.findIndex((c) => c.id === target.id);
  const priors =
    idx === -1 ? sortedStudyCasesAsc : sortedStudyCasesAsc.slice(0, idx);
  const priorEligibleCount = priors.filter((c) => !c.excluded).length;
  if (priorEligibleCount < MIN_PERCENTILE_PRIOR_N) return null;
  return personalPercentileEngine(target, priors, factors);
}

function matchesFilters(
  c: CaseRecord,
  filters: StudyAnalyticsFilters,
): boolean {
  if (filters.from && c.finishedAt < filters.from) return false;
  if (filters.to && c.finishedAt > filters.to) return false;
  if (filters.complexity && c.complexity !== filters.complexity) return false;
  if (filters.included === true && c.excluded) return false;
  if (filters.included === false && !c.excluded) return false;
  if (filters.tagId && !c.tagIds.includes(filters.tagId)) return false;
  return true;
}

/**
 * Everything the Study detail screen needs for one study type. Ownership is
 * checked: a study type the caller does not own resolves as `NotFoundError`
 * (never distinguishing "doesn't exist" from "belongs to someone else").
 * Filters narrow the displayed case list and trend only — the benchmark
 * always reflects all eligible cases for this study type.
 */
export async function getStudyAnalytics(
  db: DbClient,
  userId: string,
  studyTypeId: string,
  filters: StudyAnalyticsFilters = {},
  // Accepted for signature symmetry with the rest of the analytics service
  // (and so callers/tests can pin "now" deterministically); this function
  // itself has no now-relative computation today.
  now: Date = new Date(),
): Promise<StudyAnalyticsData> {
  void now;
  const studyRows = await db
    .select({
      id: userStudyTypes.id,
      name: userStudyTypes.name,
      shortName: userStudyTypes.shortName,
    })
    .from(userStudyTypes)
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .limit(1);
  const study = studyRows[0];
  if (!study) throw new NotFoundError("Study type not found");

  // Complexity factors are learned from the user's ENTIRE history across all
  // study types (per SPEC), not just this one, so load all cases for that
  // and this study's cases for everything else.
  const allCases = await loadUserCases(db, userId);
  const factors = computeComplexityFactors(allCases);
  const studyCases = allCases.filter((c) => c.studyTypeId === studyTypeId);

  const stats = computeStudyStats(studyCases, factors);

  const filtered = studyCases.filter((c) => matchesFilters(c, filters));
  const trend = computeTrend(filtered, factors, "week");

  const sortedStudyCasesAsc = [...studyCases].sort(
    (a, b) => a.finishedAt.getTime() - b.finishedAt.getTime(),
  );
  const mostRecentEligible = sortedStudyCasesAsc
    .filter((c) => !c.excluded)
    .at(-1);
  const personalPercentile = mostRecentEligible
    ? personalPercentileForCase(
        mostRecentEligible,
        sortedStudyCasesAsc,
        factors,
      )
    : null;

  const tagRows = await db
    .select({
      id: tagsTable.id,
      name: tagsTable.name,
      excludeFromBenchmark: tagsTable.excludeFromBenchmark,
    })
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId));
  const tagsById = new Map(tagRows.map((t) => [t.id, t]));

  const sortedFilteredDesc = [...filtered].sort(
    (a, b) => b.finishedAt.getTime() - a.finishedAt.getTime(),
  );

  const recentCases: RecentCaseRow[] = sortedFilteredDesc
    .slice(0, RECENT_CASES_LIMIT)
    .map((c) => {
      const factor = factors[c.complexity]?.factor ?? 1.0;
      const tagNames = c.tagIds
        .map((id) => tagsById.get(id)?.name)
        .filter((n): n is string => n != null);
      const excludingTagNames = c.tagIds
        .map((id) => tagsById.get(id))
        .filter(
          (
            t,
          ): t is { id: string; name: string; excludeFromBenchmark: boolean } =>
            t != null && t.excludeFromBenchmark,
        )
        .map((t) => t.name);
      return {
        id: c.id,
        finishedAt: c.finishedAt,
        rawDurationMs: c.activeDurationMs,
        adjustedDurationMs: c.activeDurationMs / (factor === 0 ? 1.0 : factor),
        complexity: c.complexity,
        excluded: c.excluded,
        excludingTagNames,
        tagNames,
        personalPercentile: personalPercentileForCase(
          c,
          sortedStudyCasesAsc,
          factors,
        ),
      };
    });

  return {
    studyTypeId: study.id,
    studyName: study.name,
    shortName: study.shortName,
    stats,
    complexityFactors: factors,
    trend,
    recentCases,
    filteredCount: filtered.length,
    availableTags: tagRows,
    personalPercentile,
  };
}
