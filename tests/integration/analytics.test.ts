import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql as rawSql, db } from "@/db";
import { achievementEvents, timingEntries, timingEntryTags } from "@/db/schema";
import * as studiesService from "@/features/studies/service";
import * as tagsService from "@/features/tags/service";
import * as timerService from "@/features/timer/service";
import {
  getDashboardData,
  getStudyAnalytics,
} from "@/features/analytics/service";
import { syncAchievements } from "@/features/achievements/service";
import type { Complexity } from "@/features/analytics/types";
import { NotFoundError } from "@/server/errors";
import { eq } from "drizzle-orm";
import { createTestUser } from "./helpers";

async function resetDatabase() {
  await rawSql`truncate table "user" cascade`;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await rawSql.end();
});

async function makeStudyType(userId: string, name = "CT A/P +C") {
  return studiesService.createStudyType(db, userId, {
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name,
    shortName: name,
  });
}

/** Inserts a COMPLETED timing entry directly (bypassing the timer state
 * machine) so fixtures can control finishedAt/duration precisely. */
async function insertCompletedCase(
  userId: string,
  studyTypeId: string,
  opts: {
    finishedAt: Date;
    durationMs: number;
    complexity?: Complexity;
    tagIds?: string[];
  },
) {
  const startedAt = new Date(opts.finishedAt.getTime() - opts.durationMs);
  const rows = await db
    .insert(timingEntries)
    .values({
      userId,
      studyTypeId,
      status: "COMPLETED",
      startedAt,
      finishedAt: opts.finishedAt,
      activeDurationMs: opts.durationMs,
      complexity: opts.complexity ?? "TYPICAL",
      pausedDurationMs: 0,
      classificationFinalizedAt: opts.finishedAt,
    })
    .returning();
  const entry = rows[0];
  if (opts.tagIds && opts.tagIds.length > 0) {
    await db
      .insert(timingEntryTags)
      .values(opts.tagIds.map((tagId) => ({ timingEntryId: entry.id, tagId })));
  }
  return entry;
}

const DAY_MS = 86_400_000;
const baseDate = new Date("2026-01-01T12:00:00.000Z");

describe("getDashboardData", () => {
  it("reflects a single completed case", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    const before = await getDashboardData(db, userId);
    expect(before.hasAnyCases).toBe(false);
    expect(before.studyCards).toHaveLength(0);

    await insertCompletedCase(userId, study.id, {
      finishedAt: baseDate,
      durationMs: 6 * 60_000,
    });

    const data = await getDashboardData(db, userId);
    expect(data.hasAnyCases).toBe(true);
    expect(data.studyCards).toHaveLength(1);
    expect(data.studyCards[0].studyTypeId).toBe(study.id);
    expect(data.studyCards[0].stats.totalCount).toBe(1);
    expect(data.studyCards[0].stats.eligibleCount).toBe(1);
    expect(data.overview.completedCases).toBe(1);
  });

  it("sorts study cards by case count, most-worked-on first", async () => {
    const userId = await createTestUser();
    const busy = await makeStudyType(userId, "CT Chest +C");
    const quiet = await makeStudyType(userId, "CT Chest -C");

    for (let i = 0; i < 3; i++) {
      await insertCompletedCase(userId, busy.id, {
        finishedAt: new Date(baseDate.getTime() + i * DAY_MS),
        durationMs: 5 * 60_000,
      });
    }
    await insertCompletedCase(userId, quiet.id, {
      finishedAt: baseDate,
      durationMs: 5 * 60_000,
    });

    const data = await getDashboardData(db, userId);
    expect(data.studyCards.map((c) => c.studyTypeId)).toEqual([
      busy.id,
      quiet.id,
    ]);
  });
});

describe("benchmark eligibility", () => {
  it("excluded-tag cases count toward volume but never the benchmark", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const interrupted = await tagsService.createTag(db, userId, {
      name: "Interrupted",
      excludeFromBenchmark: true,
    });

    // 5 eligible cases at a steady 6-minute pace.
    for (let i = 0; i < 5; i++) {
      await insertCompletedCase(userId, study.id, {
        finishedAt: new Date(baseDate.getTime() + i * DAY_MS),
        durationMs: 6 * 60_000,
      });
    }
    // One wildly long excluded case that would otherwise skew the median.
    await insertCompletedCase(userId, study.id, {
      finishedAt: new Date(baseDate.getTime() + 5 * DAY_MS),
      durationMs: 90 * 60_000,
      tagIds: [interrupted.id],
    });

    const analytics = await getStudyAnalytics(db, userId, study.id);
    expect(analytics.stats.totalCount).toBe(6);
    expect(analytics.stats.eligibleCount).toBe(5);
    expect(analytics.stats.excludedCount).toBe(1);
    // The benchmark (recent pace) is unaffected by the excluded outlier.
    expect(analytics.stats.recentPaceMs).toBe(6 * 60_000);

    // The excluded case is still visible in the (unfiltered) recent list.
    const excludedRow = analytics.recentCases.find((c) => c.excluded);
    expect(excludedRow).toBeDefined();
    expect(excludedRow?.excludingTagNames).toEqual(["Interrupted"]);

    // Filtering to "included only" drops the excluded row from the display.
    const includedOnly = await getStudyAnalytics(db, userId, study.id, {
      included: true,
    });
    expect(includedOnly.recentCases.every((c) => !c.excluded)).toBe(true);
    expect(includedOnly.filteredCount).toBe(5);
    // The benchmark is identical regardless of the display filter.
    expect(includedOnly.stats.recentPaceMs).toBe(analytics.stats.recentPaceMs);
  });
});

describe("deletion recalculation", () => {
  it("recomputes stats after a case is deleted", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    const entries = [];
    for (let i = 0; i < 5; i++) {
      entries.push(
        await insertCompletedCase(userId, study.id, {
          finishedAt: new Date(baseDate.getTime() + i * DAY_MS),
          durationMs: 6 * 60_000,
        }),
      );
    }
    // One much longer case pulls the median.
    const slow = await insertCompletedCase(userId, study.id, {
      finishedAt: new Date(baseDate.getTime() + 5 * DAY_MS),
      durationMs: 20 * 60_000,
    });

    const before = await getStudyAnalytics(db, userId, study.id);
    expect(before.stats.totalCount).toBe(6);
    const before20MinPresent = before.recentCases.some(
      (c) => c.rawDurationMs === 20 * 60_000,
    );
    expect(before20MinPresent).toBe(true);

    await timerService.deleteEntry(db, userId, slow.id);

    const after = await getStudyAnalytics(db, userId, study.id);
    expect(after.stats.totalCount).toBe(5);
    expect(after.recentCases.some((c) => c.rawDurationMs === 20 * 60_000)).toBe(
      false,
    );
    // With the outlier gone, the recent pace returns to the steady 6-minute
    // pace shared by every remaining case.
    expect(after.stats.recentPaceMs).toBe(6 * 60_000);

    void entries;
  });
});

describe("combined studies", () => {
  it("keeps a combined exam's stats independent from its components", async () => {
    const userId = await createTestUser();
    const component = await makeStudyType(userId, "CT Chest +C");
    const combined = await makeStudyType(userId, "CT C/A/P +C");

    await insertCompletedCase(userId, component.id, {
      finishedAt: baseDate,
      durationMs: 5 * 60_000,
    });
    await insertCompletedCase(userId, combined.id, {
      finishedAt: baseDate,
      durationMs: 15 * 60_000,
    });
    await insertCompletedCase(userId, combined.id, {
      finishedAt: new Date(baseDate.getTime() + DAY_MS),
      durationMs: 17 * 60_000,
    });

    const componentAnalytics = await getStudyAnalytics(
      db,
      userId,
      component.id,
    );
    const combinedAnalytics = await getStudyAnalytics(db, userId, combined.id);

    expect(componentAnalytics.stats.totalCount).toBe(1);
    expect(combinedAnalytics.stats.totalCount).toBe(2);
    expect(
      combinedAnalytics.recentCases.every(
        (c) => c.rawDurationMs !== 5 * 60_000,
      ),
    ).toBe(true);
  });
});

describe("cross-user isolation", () => {
  it("getStudyAnalytics on another user's study type resolves as NotFoundError", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");
    const studyA = await makeStudyType(userA);
    await insertCompletedCase(userA, studyA.id, {
      finishedAt: baseDate,
      durationMs: 6 * 60_000,
    });

    await expect(
      getStudyAnalytics(db, userB, studyA.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("syncAchievements", () => {
  it("records each achievement exactly once across repeated syncs", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    for (let i = 0; i < 10; i++) {
      await insertCompletedCase(userId, study.id, {
        finishedAt: new Date(baseDate.getTime() + i * DAY_MS),
        durationMs: 6 * 60_000,
      });
    }

    const first = await syncAchievements(db, userId);
    expect(first.map((a) => a.key)).toContain("timed_10");

    const second = await syncAchievements(db, userId);
    expect(second).toHaveLength(0);

    const rows = await db
      .select()
      .from(achievementEvents)
      .where(eq(achievementEvents.userId, userId));
    const timed10Rows = rows.filter((r) => r.achievementKey === "timed_10");
    expect(timed10Rows).toHaveLength(1);
  });
});
