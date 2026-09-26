/**
 * Pure achievement evaluation for RadTempo.
 *
 * `evaluateAchievements` looks at the CURRENT state (all cases + per-study
 * stats + complexity factors) and returns every achievement key that is
 * currently satisfied. It does not know which achievements have already
 * been celebrated — that de-duplication lives in `achievement_events`
 * (unique on user_id, achievement_key, study_type_id) and is the caller's
 * responsibility, per SPEC "Gamification": "Store achievement_events to
 * avoid repeat celebrations."
 */

import type {
  CaseRecord,
  ComplexityFactors,
  StudyStats,
} from "../analytics/types";
import { computeOverview } from "../analytics/engine";
import { ACHIEVEMENT_DEFINITIONS, type AchievementKey } from "./definitions";

export interface EarnedAchievement {
  key: AchievementKey;
  studyTypeId?: string;
  metadata: Record<string, unknown>;
}

const IMPROVEMENT_5_THRESHOLD = 0.05;
const IMPROVEMENT_10_THRESHOLD = 0.1;
const READING_STREAK_THRESHOLD = 5;
const STUDY_VOLUME_THRESHOLD = 50;
const TIMED_10 = 10;
const TIMED_50 = 50;
const TIMED_100 = 100;

export function evaluateAchievements(
  allCases: CaseRecord[],
  statsByStudy: Record<string, StudyStats>,
  _factors: ComplexityFactors,
): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];

  const completedCases = allCases.length;
  if (completedCases >= TIMED_10) {
    earned.push({ key: "timed_10", metadata: { completedCases } });
  }
  if (completedCases >= TIMED_50) {
    earned.push({ key: "timed_50", metadata: { completedCases } });
  }
  if (completedCases >= TIMED_100) {
    earned.push({ key: "timed_100", metadata: { completedCases } });
  }

  for (const [studyTypeId, stats] of Object.entries(statsByStudy)) {
    if (stats.totalCount >= STUDY_VOLUME_THRESHOLD) {
      earned.push({
        key: "study_50",
        studyTypeId,
        metadata: { totalCount: stats.totalCount },
      });
    }

    if (stats.maturity === "ESTABLISHED") {
      earned.push({
        key: "first_established_benchmark",
        studyTypeId,
        metadata: { eligibleCount: stats.eligibleCount },
      });

      if (
        stats.improvement !== null &&
        stats.improvement >= IMPROVEMENT_10_THRESHOLD
      ) {
        earned.push({
          key: "improvement_10",
          studyTypeId,
          metadata: { improvement: stats.improvement },
        });
      } else if (
        stats.improvement !== null &&
        stats.improvement >= IMPROVEMENT_5_THRESHOLD
      ) {
        earned.push({
          key: "improvement_5",
          studyTypeId,
          metadata: { improvement: stats.improvement },
        });
      }
    }
  }

  // Longest streak is a stable, deterministic fact about the case history —
  // it does not depend on "now", unlike the current streak.
  const latestFinishedAt = allCases.reduce<Date | null>((latest, c) => {
    if (latest === null || c.finishedAt > latest) return c.finishedAt;
    return latest;
  }, null);
  const overview = computeOverview(allCases, latestFinishedAt ?? new Date(0));
  if (overview.readingDayStreak.longest >= READING_STREAK_THRESHOLD) {
    earned.push({
      key: "reading_streak_5",
      metadata: { longestStreak: overview.readingDayStreak.longest },
    });
  }

  return earned;
}

export interface PersonalRecords {
  fastestEligibleRead: {
    caseId: string;
    studyTypeId: string;
    adjustedMs: number;
    rawMs: number;
  } | null;
  bestRecentMedianByStudy: Record<string, number>;
  largestSustainedImprovement: {
    studyTypeId: string;
    improvement: number;
  } | null;
}

/**
 * Personal records per SPEC "Gamification": fastest eligible read, best
 * recent median per study, largest sustained improvement (i.e. improvement
 * measured on a study type whose benchmark is ESTABLISHED).
 */
export function personalRecords(
  allCases: CaseRecord[],
  statsByStudy: Record<string, StudyStats>,
  factors: ComplexityFactors,
): PersonalRecords {
  let fastest: PersonalRecords["fastestEligibleRead"] = null;
  for (const c of allCases) {
    if (c.excluded) continue;
    const factor = factors[c.complexity]?.factor ?? 1.0;
    const adjustedMs = c.activeDurationMs / (factor === 0 ? 1.0 : factor);
    if (fastest === null || adjustedMs < fastest.adjustedMs) {
      fastest = {
        caseId: c.id,
        studyTypeId: c.studyTypeId,
        adjustedMs,
        rawMs: c.activeDurationMs,
      };
    }
  }

  const bestRecentMedianByStudy: Record<string, number> = {};
  for (const [studyTypeId, stats] of Object.entries(statsByStudy)) {
    if (stats.recentPaceMs !== null) {
      bestRecentMedianByStudy[studyTypeId] = stats.recentPaceMs;
    }
  }

  let largestSustainedImprovement: PersonalRecords["largestSustainedImprovement"] =
    null;
  for (const [studyTypeId, stats] of Object.entries(statsByStudy)) {
    if (stats.maturity !== "ESTABLISHED" || stats.improvement === null)
      continue;
    if (
      largestSustainedImprovement === null ||
      stats.improvement > largestSustainedImprovement.improvement
    ) {
      largestSustainedImprovement = {
        studyTypeId,
        improvement: stats.improvement,
      };
    }
  }

  return {
    fastestEligibleRead: fastest,
    bestRecentMedianByStudy,
    largestSustainedImprovement,
  };
}

export { ACHIEVEMENT_DEFINITIONS };
export type { AchievementKey };
