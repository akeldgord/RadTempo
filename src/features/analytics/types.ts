/**
 * Pure, dependency-free types for the RadTempo analytics engine.
 *
 * These types describe the minimal shape of data the engine needs. They are
 * intentionally decoupled from the Drizzle DB schema so this module has zero
 * dependencies and can be unit tested in isolation.
 */

export type Complexity = "EASY" | "TYPICAL" | "DIFFICULT";

/** Sentence-case display labels for `Complexity` — the stored/compared
 * values stay the upper-case enum; only presentation changes. */
export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  EASY: "Easy",
  TYPICAL: "Typical",
  DIFFICULT: "Difficult",
};

export type Maturity = "NONE" | "EARLY" | "BUILDING" | "ESTABLISHED";

/**
 * A single completed timing entry, as far as analytics cares.
 *
 * `excluded` means "excluded from benchmark" (e.g. because of an
 * exclude_from_benchmark tag) — it does NOT mean the case was deleted or
 * hidden from history/volume/active-time calculations.
 */
export interface CaseRecord {
  id: string;
  studyTypeId: string;
  startedAt: Date;
  finishedAt: Date;
  /** raw active duration in ms: finished_at - started_at - paused_duration */
  activeDurationMs: number;
  complexity: Complexity;
  /** true if any attached tag has exclude_from_benchmark = true */
  excluded: boolean;
  tagIds: string[];
}

export interface ComplexityFactor {
  factor: number;
  /** number of ratios pooled to compute this factor */
  n: number;
  /** true if factor is 1.0 fallback due to insufficient data */
  provisional: boolean;
}

export type ComplexityFactors = Record<Complexity, ComplexityFactor>;

export interface ComplexityDistribution {
  EASY: number;
  TYPICAL: number;
  DIFFICULT: number;
}

export interface StudyStats {
  totalCount: number;
  eligibleCount: number;
  excludedCount: number;
  /** median of last RECENT_WINDOW eligible adjusted durations (ms), or null */
  recentPaceMs: number | null;
  /** median of up to COMPARISON_WINDOW eligible adjusted durations preceding the recent window, or null */
  comparisonPaceMs: number | null;
  /** (comparison - recent) / comparison; positive = faster; null if not computable */
  improvement: number | null;
  /** benchmark = recent pace */
  benchmarkMs: number | null;
  maturity: Maturity;
  personalBestMs: {
    adjusted: number | null;
    raw: number | null;
  };
  rawMedianMs: number | null;
  adjustedMedianMs: number | null;
  complexityDistribution: ComplexityDistribution;
  /** completed timed cases / summed active duration in hours, across ALL cases (incl. excluded) */
  casesPerHour: number | null;
  totalActiveMs: number;
}

export interface TrendPoint {
  /** ISO date string (UTC) for the start of the bucket, e.g. "2026-01-05" */
  bucketStart: string;
  rawMedianMs: number;
  adjustedMedianMs: number;
  count: number;
}

export type TrendBucket = "week" | "month";

export type PostCaseFeedbackKind =
  "BASELINE_STARTED" | "BASELINE_BUILDING" | "COMPARISON" | "EXCLUDED";

export interface PostCaseFeedback {
  kind: PostCaseFeedbackKind;
  caseNumber: number;
  /** positive = faster than recent pace of prior eligible cases; undefined when not computable */
  percentVsRecent?: number;
  recentPaceMs: number | null;
  /** The target case's own duration, adjusted for its learned complexity
   * factor — the *comparable* counterpart to `recentPaceMs`. Only set (and
   * non-null) for `COMPARISON`; null for BASELINE_STARTED/BASELINE_BUILDING/
   * EXCLUDED, where there is no comparison to draw. Never the raw duration —
   * see R1 in DESIGN_NOTES.md "Audit remediation". */
  adjustedDurationMs: number | null;
}

export interface ReadingDayStreak {
  current: number;
  longest: number;
}

export interface OverviewStats {
  completedCases: number;
  totalActiveMs: number;
  timedCasesPerHour: number | null;
  readingDayStreak: ReadingDayStreak;
}
