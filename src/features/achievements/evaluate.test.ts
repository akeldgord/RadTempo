import { describe, expect, it } from "vitest";
import type {
  CaseRecord,
  Complexity,
  ComplexityFactors,
  StudyStats,
} from "../analytics/types";
import { computeStudyStats } from "../analytics/engine";
import {
  ACHIEVEMENT_DEFINITIONS,
  evaluateAchievements,
  personalRecords,
} from "./evaluate";

const IDENTITY_FACTORS: ComplexityFactors = {
  EASY: { factor: 1, n: 0, provisional: true },
  TYPICAL: { factor: 1, n: 0, provisional: true },
  DIFFICULT: { factor: 1, n: 0, provisional: true },
};

let counter = 0;
function mkCase(opts: {
  studyTypeId?: string;
  finishedAt: Date;
  durationMs: number;
  complexity?: Complexity;
  excluded?: boolean;
}): CaseRecord {
  counter++;
  return {
    id: `case-${counter}`,
    studyTypeId: opts.studyTypeId ?? "study-a",
    startedAt: new Date(opts.finishedAt.getTime() - opts.durationMs),
    finishedAt: opts.finishedAt,
    activeDurationMs: opts.durationMs,
    complexity: opts.complexity ?? "TYPICAL",
    excluded: opts.excluded ?? false,
    tagIds: [],
  };
}

const BASE = new Date("2026-01-01T12:00:00.000Z");
function daysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function buildStats(cases: CaseRecord[]): Record<string, StudyStats> {
  const byStudy = new Map<string, CaseRecord[]>();
  for (const c of cases) {
    const list = byStudy.get(c.studyTypeId) ?? [];
    list.push(c);
    byStudy.set(c.studyTypeId, list);
  }
  const result: Record<string, StudyStats> = {};
  for (const [studyTypeId, studyCases] of byStudy) {
    result[studyTypeId] = computeStudyStats(studyCases, IDENTITY_FACTORS);
  }
  return result;
}

describe("ACHIEVEMENT_DEFINITIONS", () => {
  it("never uses competitive or cross-user language", () => {
    for (const def of Object.values(ACHIEVEMENT_DEFINITIONS)) {
      const text = `${def.title} ${def.description}`.toLowerCase();
      expect(text).not.toMatch(
        /slow|failed|rank|leaderboard|fastest radiologist|speed demon|average radiologist/,
      );
    }
  });
});

describe("evaluateAchievements", () => {
  it("awards timed_10 at exactly 10 completed cases and not before", () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    expect(
      evaluateAchievements(nine, buildStats(nine), IDENTITY_FACTORS).some(
        (a) => a.key === "timed_10",
      ),
    ).toBe(false);

    const ten = Array.from({ length: 10 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    expect(
      evaluateAchievements(ten, buildStats(ten), IDENTITY_FACTORS).some(
        (a) => a.key === "timed_10",
      ),
    ).toBe(true);
  });

  it("awards timed_50 and timed_100 at volume thresholds", () => {
    const fifty = Array.from({ length: 50 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    const keys50 = evaluateAchievements(
      fifty,
      buildStats(fifty),
      IDENTITY_FACTORS,
    ).map((a) => a.key);
    expect(keys50).toContain("timed_10");
    expect(keys50).toContain("timed_50");
    expect(keys50).not.toContain("timed_100");

    const hundred = Array.from({ length: 100 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    const keys100 = evaluateAchievements(
      hundred,
      buildStats(hundred),
      IDENTITY_FACTORS,
    ).map((a) => a.key);
    expect(keys100).toContain("timed_100");
  });

  it("awards study_50 per study type once total count reaches 50", () => {
    const cases = Array.from({ length: 50 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-chest",
        finishedAt: daysFrom(BASE, i),
        durationMs: 100_000,
      }),
    );
    const earned = evaluateAchievements(
      cases,
      buildStats(cases),
      IDENTITY_FACTORS,
    );
    const study50 = earned.find((a) => a.key === "study_50");
    expect(study50).toBeDefined();
    expect(study50?.studyTypeId).toBe("ct-chest");
  });

  it("awards first_established_benchmark once a study reaches ESTABLISHED maturity (15 eligible)", () => {
    const cases = Array.from({ length: 15 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-chest",
        finishedAt: daysFrom(BASE, i),
        durationMs: 100_000,
      }),
    );
    const stats = buildStats(cases);
    expect(stats["ct-chest"].maturity).toBe("ESTABLISHED");
    const earned = evaluateAchievements(cases, stats, IDENTITY_FACTORS);
    expect(
      earned.some(
        (a) =>
          a.key === "first_established_benchmark" &&
          a.studyTypeId === "ct-chest",
      ),
    ).toBe(true);
  });

  it("awards improvement_5 / improvement_10 only when sustained (ESTABLISHED + threshold met)", () => {
    // 20 cases: first 10 slower (comparison window), last 10 faster (recent window) by >10%.
    const slow = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, i),
        durationMs: 1_000_000,
      }),
    );
    const fast = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, 10 + i),
        durationMs: 880_000,
      }),
    );
    const cases = [...slow, ...fast];
    const stats = buildStats(cases);
    expect(stats["ct-ap"].maturity).toBe("ESTABLISHED");
    expect(stats["ct-ap"].improvement).toBeCloseTo(0.12, 5);

    const earned = evaluateAchievements(cases, stats, IDENTITY_FACTORS);
    expect(
      earned.some(
        (a) => a.key === "improvement_10" && a.studyTypeId === "ct-ap",
      ),
    ).toBe(true);
    // improvement_5 should not double-fire when improvement_10 already qualifies for the same study.
    expect(
      earned.some(
        (a) => a.key === "improvement_5" && a.studyTypeId === "ct-ap",
      ),
    ).toBe(false);
  });

  it("does not award improvement achievements while maturity is below ESTABLISHED", () => {
    const cases = Array.from({ length: 8 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, i),
        durationMs: 1_000_000 - i * 20_000,
      }),
    );
    const stats = buildStats(cases);
    expect(stats["ct-ap"].maturity).toBe("BUILDING");
    const earned = evaluateAchievements(cases, stats, IDENTITY_FACTORS);
    expect(
      earned.some(
        (a) => a.key === "improvement_5" || a.key === "improvement_10",
      ),
    ).toBe(false);
  });

  it("awards reading_streak_5 for 5 consecutive UTC reading days", () => {
    const cases = Array.from({ length: 5 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    const earned = evaluateAchievements(
      cases,
      buildStats(cases),
      IDENTITY_FACTORS,
    );
    expect(earned.some((a) => a.key === "reading_streak_5")).toBe(true);
  });

  it("does not award reading_streak_5 for fewer than 5 consecutive days", () => {
    const cases = [0, 1, 2, 5, 6].map((d) =>
      mkCase({ finishedAt: daysFrom(BASE, d), durationMs: 100_000 }),
    );
    const earned = evaluateAchievements(
      cases,
      buildStats(cases),
      IDENTITY_FACTORS,
    );
    expect(earned.some((a) => a.key === "reading_streak_5")).toBe(false);
  });
});

describe("personalRecords", () => {
  it("finds the fastest eligible read across studies, ignoring excluded cases", () => {
    const cases = [
      mkCase({
        studyTypeId: "a",
        finishedAt: daysFrom(BASE, 0),
        durationMs: 500_000,
      }),
      mkCase({
        studyTypeId: "b",
        finishedAt: daysFrom(BASE, 1),
        durationMs: 50_000,
        excluded: true,
      }),
      mkCase({
        studyTypeId: "b",
        finishedAt: daysFrom(BASE, 2),
        durationMs: 200_000,
      }),
    ];
    const records = personalRecords(cases, buildStats(cases), IDENTITY_FACTORS);
    expect(records.fastestEligibleRead?.studyTypeId).toBe("b");
    expect(records.fastestEligibleRead?.rawMs).toBe(200_000);
  });

  it("reports best recent median per study and largest sustained improvement", () => {
    const slow = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, i),
        durationMs: 1_000_000,
      }),
    );
    const fast = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, 10 + i),
        durationMs: 800_000,
      }),
    );
    const cases = [...slow, ...fast];
    const stats = buildStats(cases);
    const records = personalRecords(cases, stats, IDENTITY_FACTORS);
    expect(records.bestRecentMedianByStudy["ct-ap"]).toBe(800_000);
    expect(records.largestSustainedImprovement?.studyTypeId).toBe("ct-ap");
    expect(records.largestSustainedImprovement?.improvement).toBeCloseTo(
      0.2,
      5,
    );
  });

  it("does not report a negative largest sustained improvement (got slower)", () => {
    const fast = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, i),
        durationMs: 800_000,
      }),
    );
    const slow = Array.from({ length: 10 }, (_, i) =>
      mkCase({
        studyTypeId: "ct-ap",
        finishedAt: daysFrom(BASE, 10 + i),
        durationMs: 1_000_000,
      }),
    );
    const cases = [...fast, ...slow];
    const stats = buildStats(cases);
    const records = personalRecords(cases, stats, IDENTITY_FACTORS);
    expect(records.largestSustainedImprovement).toBeNull();
  });

  it("returns null records when there is no data", () => {
    const records = personalRecords([], {}, IDENTITY_FACTORS);
    expect(records.fastestEligibleRead).toBeNull();
    expect(records.largestSustainedImprovement).toBeNull();
    expect(records.bestRecentMedianByStudy).toEqual({});
  });
});
