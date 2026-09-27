/**
 * Achievement sync: evaluates the user's current state and records any
 * newly-earned achievements. See docs/SPEC.md, section "Gamification".
 *
 * Achievements are additive only: `syncAchievements` is safe to call after
 * every mutation that could change the user's stats (finish, classification
 * finalize, deletion). It never revokes a previously-earned achievement —
 * deleting cases or losing an established benchmark does not take away an
 * achievement already recorded in `achievement_events`, by design (SPEC:
 * "Store achievement_events to avoid repeat celebrations" implies earned
 * events are a permanent record, not a live-recomputed status).
 */

import { desc, eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import { achievementEvents, userStudyTypes } from "@/db/schema";
import {
  computeComplexityFactors,
  computeOverview,
  computeStudyStats,
  formatDuration,
} from "@/features/analytics/engine";
import { loadUserCases } from "@/features/analytics/repository";
import type { CaseRecord, StudyStats } from "@/features/analytics/types";
import { ACHIEVEMENT_DEFINITIONS, type AchievementKey } from "./definitions";
import {
  evaluateAchievements,
  personalRecords,
  type PersonalRecords,
} from "./evaluate";

export interface NewlyEarnedAchievement {
  key: AchievementKey;
  title: string;
  description: string;
  studyTypeId: string | null;
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
 * Evaluates achievements against the user's current history and inserts any
 * that are newly satisfied, using `ON CONFLICT DO NOTHING` against the
 * unique (user_id, achievement_key, study_type_id) index so re-running this
 * never duplicates or re-celebrates an achievement. Returns only the
 * achievements this call actually inserted.
 */
export async function syncAchievements(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<NewlyEarnedAchievement[]> {
  const allCases = await loadUserCases(db, userId);
  if (allCases.length === 0) return [];

  const factors = computeComplexityFactors(allCases);
  const statsByStudy: Record<string, StudyStats> = {};
  for (const [studyTypeId, cases] of groupByStudy(allCases)) {
    statsByStudy[studyTypeId] = computeStudyStats(cases, factors);
  }

  const earned = evaluateAchievements(allCases, statsByStudy, factors);
  if (earned.length === 0) return [];

  const inserted = await db
    .insert(achievementEvents)
    .values(
      earned.map((e) => ({
        userId,
        achievementKey: e.key,
        studyTypeId: e.studyTypeId ?? null,
        earnedAt: now,
        metadataJson: e.metadata,
      })),
    )
    .onConflictDoNothing()
    .returning();

  return inserted.map((row) => {
    const def = ACHIEVEMENT_DEFINITIONS[row.achievementKey as AchievementKey];
    return {
      key: row.achievementKey as AchievementKey,
      title: def?.title ?? row.achievementKey,
      description: def?.description ?? "",
      studyTypeId: row.studyTypeId,
    };
  });
}

// ---------------------------------------------------------------------------
// Achievements page data (earned history + calm "upcoming" progress text)
// ---------------------------------------------------------------------------

export interface EarnedAchievementRow {
  key: AchievementKey;
  title: string;
  description: string;
  earnedAt: Date;
  studyTypeId: string | null;
  studyName: string | null;
}

export interface UpcomingMilestone {
  key: AchievementKey;
  title: string;
  studyTypeId: string | null;
  studyName: string | null;
  /** Calm, non-competitive progress text, e.g. "7 of 10 timed cases." */
  progressText: string;
}

export interface AchievementsPageData {
  earned: EarnedAchievementRow[];
  upcoming: UpcomingMilestone[];
  personalRecords: PersonalRecords;
}

const TIMED_MILESTONES: [AchievementKey, number][] = [
  ["timed_10", 10],
  ["timed_50", 50],
  ["timed_100", 100],
];
const STUDY_VOLUME_MILESTONE = 50;
const READING_STREAK_MILESTONE = 5;
const UPCOMING_STUDY_LIMIT = 3;

/**
 * Everything the Achievements screen needs: the full earned history (with
 * study names joined in), and a short, calm list of upcoming milestones
 * with plain progress text — never a countdown or "you're behind" framing.
 */
export async function getAchievementsPageData(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<AchievementsPageData> {
  const allCases = await loadUserCases(db, userId);
  const factors = computeComplexityFactors(allCases);

  const byStudy = new Map<string, CaseRecord[]>();
  for (const c of allCases) {
    const list = byStudy.get(c.studyTypeId);
    if (list) list.push(c);
    else byStudy.set(c.studyTypeId, [c]);
  }
  const statsByStudy: Record<string, StudyStats> = {};
  for (const [studyTypeId, cases] of byStudy) {
    statsByStudy[studyTypeId] = computeStudyStats(cases, factors);
  }

  const studyRows = await db
    .select({
      id: userStudyTypes.id,
      name: userStudyTypes.name,
    })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const namesById = new Map(studyRows.map((r) => [r.id, r.name]));

  const earnedRows = await db
    .select()
    .from(achievementEvents)
    .where(eq(achievementEvents.userId, userId))
    .orderBy(desc(achievementEvents.earnedAt));

  const earned: EarnedAchievementRow[] = earnedRows.map((r) => {
    const def = ACHIEVEMENT_DEFINITIONS[r.achievementKey as AchievementKey];
    return {
      key: r.achievementKey as AchievementKey,
      title: def?.title ?? r.achievementKey,
      description: def?.description ?? "",
      earnedAt: r.earnedAt,
      studyTypeId: r.studyTypeId,
      studyName: r.studyTypeId ? (namesById.get(r.studyTypeId) ?? null) : null,
    };
  });

  const earnedKeys = new Set(
    earnedRows.map((r) => `${r.achievementKey}:${r.studyTypeId ?? ""}`),
  );
  const hasEarned = (key: AchievementKey, studyTypeId?: string) =>
    earnedKeys.has(`${key}:${studyTypeId ?? ""}`);

  const upcoming: UpcomingMilestone[] = [];

  // Next timed-cases milestone (only the nearest unearned one).
  const completedCases = allCases.length;
  const nextTimed = TIMED_MILESTONES.find(
    ([key, threshold]) => !hasEarned(key) && completedCases < threshold,
  );
  if (nextTimed) {
    const [key, threshold] = nextTimed;
    upcoming.push({
      key,
      title: ACHIEVEMENT_DEFINITIONS[key].title,
      studyTypeId: null,
      studyName: null,
      progressText: `${completedCases} of ${threshold} timed cases`,
    });
  }

  // Reading-day streak.
  if (!hasEarned("reading_streak_5")) {
    const overview = computeOverview(allCases, now);
    upcoming.push({
      key: "reading_streak_5",
      title: ACHIEVEMENT_DEFINITIONS.reading_streak_5.title,
      studyTypeId: null,
      studyName: null,
      progressText: `${overview.readingDayStreak.current} of ${READING_STREAK_MILESTONE} consecutive reading days`,
    });
  }

  // Per-study milestones: first established benchmark, and 50-of-one-study,
  // for whichever in-progress studies are closest to completion.
  const studyProgress = [...byStudy.entries()]
    .map(([studyTypeId, cases]) => ({
      studyTypeId,
      studyName: namesById.get(studyTypeId) ?? null,
      stats: statsByStudy[studyTypeId],
      totalCount: cases.length,
    }))
    .filter((s) => s.studyName != null);

  const notEstablished = studyProgress
    .filter(
      (s) =>
        s.stats.maturity !== "ESTABLISHED" &&
        !hasEarned("first_established_benchmark", s.studyTypeId),
    )
    .sort((a, b) => b.stats.eligibleCount - a.stats.eligibleCount)
    .slice(0, 1);
  for (const s of notEstablished) {
    upcoming.push({
      key: "first_established_benchmark",
      title: ACHIEVEMENT_DEFINITIONS.first_established_benchmark.title,
      studyTypeId: s.studyTypeId,
      studyName: s.studyName,
      progressText: `${s.stats.eligibleCount} of 15 comparable ${s.studyName} reads`,
    });
  }

  const notYet50 = studyProgress
    .filter(
      (s) =>
        s.totalCount < STUDY_VOLUME_MILESTONE &&
        !hasEarned("study_50", s.studyTypeId),
    )
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, UPCOMING_STUDY_LIMIT);
  for (const s of notYet50) {
    upcoming.push({
      key: "study_50",
      title: ACHIEVEMENT_DEFINITIONS.study_50.title,
      studyTypeId: s.studyTypeId,
      studyName: s.studyName,
      progressText: `${s.totalCount} of ${STUDY_VOLUME_MILESTONE} ${s.studyName} cases`,
    });
  }

  const records = personalRecords(allCases, statsByStudy, factors);

  return { earned, upcoming, personalRecords: records };
}

// Re-exported so pages can format personal-record durations without a
// separate import from the analytics engine.
export { formatDuration };
