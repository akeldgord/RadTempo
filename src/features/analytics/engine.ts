/**
 * RadTempo analytics engine.
 *
 * Pure, dependency-free, deterministic. No I/O, no Date.now() calls except
 * where a `now` parameter is explicitly threaded through by the caller.
 * See docs/SPEC.md, section "Analytics".
 */

import type {
  CaseRecord,
  Complexity,
  ComplexityDistribution,
  ComplexityFactor,
  ComplexityFactors,
  Maturity,
  OverviewStats,
  PostCaseFeedback,
  ReadingDayStreak,
  StudyStats,
  TrendBucket,
  TrendPoint,
} from './types';

export const RECENT_WINDOW = 10;
export const COMPARISON_WINDOW = 20;
export const MIN_STUDY_N = 5;
export const MIN_FACTOR_N = 5;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const COMPLEXITIES: Complexity[] = ['EASY', 'TYPICAL', 'DIFFICULT'];

// ---------------------------------------------------------------------------
// Basic math
// ---------------------------------------------------------------------------

/** Median of a list of numbers. Returns null for an empty list. Does not mutate input. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function isEligible(c: CaseRecord): boolean {
  return !c.excluded;
}

function byFinishedAtAsc(a: CaseRecord, b: CaseRecord): number {
  return a.finishedAt.getTime() - b.finishedAt.getTime();
}

function sortedByFinishedAt(cases: CaseRecord[]): CaseRecord[] {
  return [...cases].sort(byFinishedAtAsc);
}

function rawDuration(c: CaseRecord): number {
  return c.activeDurationMs;
}

// ---------------------------------------------------------------------------
// Complexity factors
// ---------------------------------------------------------------------------

const IDENTITY_FACTOR: ComplexityFactor = { factor: 1.0, n: 0, provisional: true };

/**
 * Learn per-user complexity adjustment factors.
 *
 * Algorithm (SPEC "Analytics"):
 * - For each study type with >= MIN_STUDY_N eligible cases: compute the
 *   median raw duration over its eligible cases.
 * - Each eligible case in a qualifying study produces a ratio = raw / studyMedian.
 * - Pool ratios by complexity across all qualifying studies.
 * - Compute the median ratio per complexity.
 * - Normalize so TYPICAL = 1.0 (divide every category's median ratio by
 *   TYPICAL's median ratio).
 * - If a category has < MIN_FACTOR_N ratios, OR if TYPICAL itself has too
 *   few ratios to normalize against, factor = 1.0 and the category is
 *   marked `provisional`.
 */
export function computeComplexityFactors(cases: CaseRecord[]): ComplexityFactors {
  const byStudy = new Map<string, CaseRecord[]>();
  for (const c of cases) {
    if (!isEligible(c)) continue;
    const list = byStudy.get(c.studyTypeId);
    if (list) list.push(c);
    else byStudy.set(c.studyTypeId, [c]);
  }

  const ratiosByComplexity: Record<Complexity, number[]> = {
    EASY: [],
    TYPICAL: [],
    DIFFICULT: [],
  };

  for (const studyCases of byStudy.values()) {
    if (studyCases.length < MIN_STUDY_N) continue;
    const studyMedian = median(studyCases.map(rawDuration));
    if (studyMedian === null || studyMedian <= 0) continue;
    for (const c of studyCases) {
      ratiosByComplexity[c.complexity].push(rawDuration(c) / studyMedian);
    }
  }

  const typicalRatios = ratiosByComplexity.TYPICAL;
  if (typicalRatios.length < MIN_FACTOR_N) {
    // Cannot normalize reliably: everything falls back to identity.
    return {
      EASY: { ...IDENTITY_FACTOR, n: ratiosByComplexity.EASY.length },
      TYPICAL: { ...IDENTITY_FACTOR, n: typicalRatios.length },
      DIFFICULT: { ...IDENTITY_FACTOR, n: ratiosByComplexity.DIFFICULT.length },
    };
  }

  const typicalMedian = median(typicalRatios) as number;

  const result = {} as ComplexityFactors;
  for (const complexity of COMPLEXITIES) {
    const ratios = ratiosByComplexity[complexity];
    if (ratios.length < MIN_FACTOR_N) {
      result[complexity] = { factor: 1.0, n: ratios.length, provisional: true };
      continue;
    }
    const m = median(ratios) as number;
    const factor = typicalMedian === 0 ? 1.0 : m / typicalMedian;
    result[complexity] = { factor, n: ratios.length, provisional: false };
  }

  return result;
}

/** raw duration adjusted for learned complexity factor (adjusted = raw / factor). */
export function adjustDuration(c: CaseRecord, factors: ComplexityFactors): number {
  const factor = factors[c.complexity]?.factor ?? 1.0;
  return rawDuration(c) / (factor === 0 ? 1.0 : factor);
}

// ---------------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------------

/** Maturity bucket by eligible case count: 0 None, 1-4 Early, 5-14 Building, 15+ Established. */
export function maturity(eligibleCount: number): Maturity {
  if (eligibleCount <= 0) return 'NONE';
  if (eligibleCount < MIN_STUDY_N) return 'EARLY';
  if (eligibleCount < 15) return 'BUILDING';
  return 'ESTABLISHED';
}

// ---------------------------------------------------------------------------
// Study stats
// ---------------------------------------------------------------------------

export function computeStudyStats(
  casesForStudy: CaseRecord[],
  factors: ComplexityFactors,
): StudyStats {
  const sorted = sortedByFinishedAt(casesForStudy);
  const totalCount = sorted.length;
  const excludedCount = sorted.filter((c) => c.excluded).length;
  const eligible = sorted.filter(isEligible);
  const eligibleCount = eligible.length;

  const eligibleAdjusted = eligible.map((c) => adjustDuration(c, factors));
  const eligibleRaw = eligible.map(rawDuration);

  const recentSlice = eligible.slice(Math.max(0, eligibleCount - RECENT_WINDOW));
  const recentAdjusted = recentSlice.map((c) => adjustDuration(c, factors));
  const recentPaceMs = median(recentAdjusted);

  const comparisonEnd = eligibleCount - recentSlice.length;
  const comparisonStart = Math.max(0, comparisonEnd - COMPARISON_WINDOW);
  const comparisonSlice = eligible.slice(comparisonStart, comparisonEnd);
  const comparisonAdjusted = comparisonSlice.map((c) => adjustDuration(c, factors));
  const comparisonPaceMs = median(comparisonAdjusted);

  let improvement: number | null = null;
  if (recentPaceMs !== null && comparisonPaceMs !== null && comparisonPaceMs !== 0) {
    improvement = (comparisonPaceMs - recentPaceMs) / comparisonPaceMs;
  }

  const personalBestAdjusted = eligibleAdjusted.length ? Math.min(...eligibleAdjusted) : null;
  const personalBestRaw = eligibleRaw.length ? Math.min(...eligibleRaw) : null;

  const complexityDistribution: ComplexityDistribution = { EASY: 0, TYPICAL: 0, DIFFICULT: 0 };
  for (const c of sorted) complexityDistribution[c.complexity]++;

  const totalActiveMs = sorted.reduce((sum, c) => sum + c.activeDurationMs, 0);
  const casesPerHour = totalActiveMs > 0 ? totalCount / (totalActiveMs / MS_PER_HOUR) : null;

  return {
    totalCount,
    eligibleCount,
    excludedCount,
    recentPaceMs,
    comparisonPaceMs,
    improvement,
    benchmarkMs: recentPaceMs,
    maturity: maturity(eligibleCount),
    personalBestMs: { adjusted: personalBestAdjusted, raw: personalBestRaw },
    rawMedianMs: median(eligibleRaw),
    adjustedMedianMs: median(eligibleAdjusted),
    complexityDistribution,
    casesPerHour,
    totalActiveMs,
  };
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

function utcWeekStart(d: Date): Date {
  // ISO week: Monday start, UTC.
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = (day + 6) % 7; // days since Monday
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday),
  );
  return start;
}

function utcMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeTrend(
  cases: CaseRecord[],
  factors: ComplexityFactors,
  bucket: TrendBucket,
): TrendPoint[] {
  const eligible = sortedByFinishedAt(cases.filter(isEligible));
  const groups = new Map<string, { raw: number[]; adjusted: number[] }>();

  for (const c of eligible) {
    const bucketDate = bucket === 'week' ? utcWeekStart(c.finishedAt) : utcMonthStart(c.finishedAt);
    const key = toIsoDate(bucketDate);
    let g = groups.get(key);
    if (!g) {
      g = { raw: [], adjusted: [] };
      groups.set(key, g);
    }
    g.raw.push(rawDuration(c));
    g.adjusted.push(adjustDuration(c, factors));
  }

  const points: TrendPoint[] = [];
  for (const [key, g] of groups) {
    points.push({
      bucketStart: key,
      rawMedianMs: median(g.raw) as number,
      adjustedMedianMs: median(g.adjusted) as number,
      count: g.raw.length,
    });
  }

  points.sort((a, b) => (a.bucketStart < b.bucketStart ? -1 : a.bucketStart > b.bucketStart ? 1 : 0));
  return points;
}

// ---------------------------------------------------------------------------
// Personal percentile
// ---------------------------------------------------------------------------

/**
 * Fraction of prior eligible adjusted reads of the same study that were
 * slower than the target case. Null if there are no eligible prior cases.
 */
export function personalPercentile(
  targetCase: CaseRecord,
  priorCasesSameStudy: CaseRecord[],
  factors: ComplexityFactors,
): number | null {
  const priorsEligible = priorCasesSameStudy.filter(isEligible).map((c) => adjustDuration(c, factors));
  if (priorsEligible.length === 0) return null;
  const targetAdjusted = adjustDuration(targetCase, factors);
  const slowerCount = priorsEligible.filter((v) => v > targetAdjusted).length;
  return slowerCount / priorsEligible.length;
}

// ---------------------------------------------------------------------------
// Post-case feedback
// ---------------------------------------------------------------------------

/**
 * Structured feedback shown on the post-case panel immediately after a case
 * finishes. `casesForStudyIncludingTarget` must include the target case.
 */
export function postCaseFeedback(
  targetCase: CaseRecord,
  casesForStudyIncludingTarget: CaseRecord[],
  factors: ComplexityFactors,
): PostCaseFeedback {
  const sorted = sortedByFinishedAt(casesForStudyIncludingTarget);
  const targetIndex = sorted.findIndex((c) => c.id === targetCase.id);
  const caseNumber = targetIndex === -1 ? sorted.length : targetIndex + 1;

  const priorCases = targetIndex === -1 ? sorted : sorted.slice(0, targetIndex);
  const priorEligible = priorCases.filter(isEligible);

  if (priorEligible.length === 0) {
    return { kind: 'BASELINE_STARTED', caseNumber, recentPaceMs: null };
  }

  if (priorEligible.length < MIN_STUDY_N) {
    return { kind: 'BASELINE_BUILDING', caseNumber, recentPaceMs: null };
  }

  const recentPriorSlice = priorEligible.slice(Math.max(0, priorEligible.length - RECENT_WINDOW));
  const recentPriorAdjusted = recentPriorSlice.map((c) => adjustDuration(c, factors));
  const recentPaceMs = median(recentPriorAdjusted) as number;

  const targetAdjusted = adjustDuration(targetCase, factors);
  const percentVsRecent = recentPaceMs !== 0 ? (recentPaceMs - targetAdjusted) / recentPaceMs : 0;

  return {
    kind: 'COMPARISON',
    caseNumber,
    percentVsRecent,
    recentPaceMs,
  };
}

/**
 * Renders a PostCaseFeedback into the exact calm, non-competitive copy used
 * on the post-case panel. Never uses "slow"/"failed".
 */
export function formatFeedbackText(feedback: PostCaseFeedback): string {
  switch (feedback.kind) {
    case 'BASELINE_STARTED':
      return 'Personal baseline started';
    case 'BASELINE_BUILDING':
      return `Baseline building — case ${feedback.caseNumber}`;
    case 'COMPARISON': {
      const pct = feedback.percentVsRecent ?? 0;
      const magnitude = formatPercent(Math.abs(pct));
      if (pct >= 0) {
        return `${magnitude}% faster than your recent comparable pace`;
      }
      return `${magnitude}% above your recent comparable pace`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Overview / streaks
// ---------------------------------------------------------------------------

function utcDayKey(d: Date): string {
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
}

function computeReadingDayStreak(days: string[], now: Date): ReadingDayStreak {
  if (days.length === 0) return { current: 0, longest: 0 };

  const uniqueSorted = [...new Set(days)].sort();
  const dayMs = uniqueSorted.map((d) => Date.parse(d + 'T00:00:00.000Z'));

  let longest = 1;
  let run = 1;
  for (let i = 1; i < dayMs.length; i++) {
    if (dayMs[i] - dayMs[i - 1] === MS_PER_DAY) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // Current streak: consecutive run ending at the latest activity day, but
  // only "current" if that latest day is today or yesterday relative to `now`.
  const lastDayMs = dayMs[dayMs.length - 1];
  const nowDayMs = Date.parse(utcDayKey(now) + 'T00:00:00.000Z');
  const gapFromNow = (nowDayMs - lastDayMs) / MS_PER_DAY;

  let current = 0;
  if (gapFromNow <= 1) {
    current = 1;
    for (let i = dayMs.length - 1; i > 0; i--) {
      if (dayMs[i] - dayMs[i - 1] === MS_PER_DAY) current++;
      else break;
    }
  }

  return { current, longest };
}

export function computeOverview(allCases: CaseRecord[], now: Date = new Date()): OverviewStats {
  const completedCases = allCases.length;
  const totalActiveMs = allCases.reduce((sum, c) => sum + c.activeDurationMs, 0);
  const timedCasesPerHour = totalActiveMs > 0 ? completedCases / (totalActiveMs / MS_PER_HOUR) : null;
  const days = allCases.map((c) => utcDayKey(c.finishedAt));
  const readingDayStreak = computeReadingDayStreak(days, now);

  return { completedCases, totalActiveMs, timedCasesPerHour, readingDayStreak };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Formats a millisecond duration as "mm:ss" or "h:mm:ss". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Formats a fraction (e.g. 0.083) as a percentage string with at most 1 decimal (e.g. "8.3"). */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 10) / 10;
  // Avoid "-0"
  const normalized = rounded === 0 ? 0 : rounded;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}
