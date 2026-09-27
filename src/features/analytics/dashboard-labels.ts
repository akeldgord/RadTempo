/**
 * Pure label/state helpers for the Dashboard's per-study viewport cards.
 * Extracted so the eligible-vs-total-count distinction (a study can have
 * completed reads that are excluded from the benchmark) is computed and
 * tested in one place rather than inline in the page component. See
 * DESIGN_NOTES.md "Audit remediation" (R2).
 *
 * None of this changes how pace/exclusion/maturity are computed — those
 * still come from `computeStudyStats` in `engine.ts`. This module only
 * decides which words describe an already-computed `StudyStats`.
 */

import type { Maturity, StudyStats } from "./types";

type CountStats = Pick<
  StudyStats,
  "totalCount" | "eligibleCount" | "excludedCount"
>;

/** Top-right reads count: "N reads" normally, or "N reads, M comparable"
 * once any of this study's reads are excluded from the benchmark — so the
 * total stays visible while making clear not all of it counts toward the
 * comparison below. */
export function readsCountLabel(stats: CountStats): string {
  const total = `${stats.totalCount} read${stats.totalCount === 1 ? "" : "s"}`;
  if (stats.excludedCount > 0) {
    return `${total}, ${stats.eligibleCount} comparable`;
  }
  return total;
}

/** Maturity label: never claims Early/Building/Established when there is
 * no comparable (eligible) history yet, regardless of how many total reads
 * exist (they may all be excluded). */
export function maturityLabel(
  stats: Pick<StudyStats, "eligibleCount" | "maturity">,
): string {
  if (stats.eligibleCount === 0) return "Not yet comparable";
  const label: Record<Maturity, string> = {
    NONE: "Not yet comparable",
    EARLY: "Early",
    BUILDING: "Building",
    ESTABLISHED: "Established",
  };
  return label[stats.maturity];
}

export type TrendNoteState =
  | { kind: "NO_COMPARABLE" }
  | { kind: "BASELINE_STARTED" }
  | { kind: "BASELINE_FORMING" }
  | { kind: "COMPARISON"; faster: boolean; percent: number };

/** The Dashboard card's bottom-right trend note. Checks eligibleCount === 0
 * FIRST — a study with only excluded reads must never say "baseline
 * started"/show a percentage, since there is nothing comparable yet, no
 * matter how many total reads it has. `percent` is only present (and only
 * meaningful) for `COMPARISON`, once real comparison data exists. */
export function trendNoteState(
  stats: Pick<StudyStats, "eligibleCount" | "improvement" | "comparisonPaceMs">,
): TrendNoteState {
  if (stats.eligibleCount === 0) return { kind: "NO_COMPARABLE" };
  if (stats.eligibleCount === 1) return { kind: "BASELINE_STARTED" };
  if (stats.improvement === null || stats.comparisonPaceMs === null) {
    return { kind: "BASELINE_FORMING" };
  }
  return {
    kind: "COMPARISON",
    faster: stats.improvement >= 0,
    percent: Math.abs(stats.improvement),
  };
}
