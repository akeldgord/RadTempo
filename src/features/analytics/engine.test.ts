import { describe, expect, it } from "vitest";
import type { CaseRecord, Complexity, ComplexityFactors } from "./types";
import {
  RECENT_WINDOW,
  COMPARISON_WINDOW,
  MIN_STUDY_N,
  adjustDuration,
  computeComplexityFactors,
  computeOverview,
  computeStudyStats,
  computeTrend,
  formatDuration,
  formatFeedbackText,
  formatPercent,
  maturity,
  median,
  personalPercentile,
  postCaseFeedback,
} from "./engine";

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
  tagIds?: string[];
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
    tagIds: opts.tagIds ?? [],
  };
}

function daysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

const BASE = new Date("2026-01-01T12:00:00.000Z");

describe("median", () => {
  it("returns null for empty", () => {
    expect(median([])).toBeNull();
  });
  it("handles odd length", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("handles even length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("does not mutate input", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe("maturity", () => {
  it("classifies buckets per spec", () => {
    expect(maturity(0)).toBe("NONE");
    expect(maturity(1)).toBe("EARLY");
    expect(maturity(4)).toBe("EARLY");
    expect(maturity(5)).toBe("BUILDING");
    expect(maturity(14)).toBe("BUILDING");
    expect(maturity(15)).toBe("ESTABLISHED");
    expect(maturity(100)).toBe("ESTABLISHED");
  });
});

describe("computeComplexityFactors", () => {
  it("learns factors from a single qualifying study (difficult ~1.5x, easy ~0.8x)", () => {
    const cases: CaseRecord[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, i),
          durationMs: 80_000,
          complexity: "EASY",
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 5 + i),
          durationMs: 100_000,
          complexity: "TYPICAL",
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 15 + i),
          durationMs: 150_000,
          complexity: "DIFFICULT",
        }),
      );
    }

    const factors = computeComplexityFactors(cases);
    expect(factors.TYPICAL.factor).toBeCloseTo(1.0, 5);
    expect(factors.TYPICAL.provisional).toBe(false);
    expect(factors.EASY.factor).toBeCloseTo(0.8, 5);
    expect(factors.EASY.provisional).toBe(false);
    expect(factors.DIFFICULT.factor).toBeCloseTo(1.5, 5);
    expect(factors.DIFFICULT.provisional).toBe(false);
  });

  it("marks a sparse category provisional while others are learned", () => {
    const cases: CaseRecord[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, i),
          durationMs: 80_000,
          complexity: "EASY",
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 5 + i),
          durationMs: 100_000,
          complexity: "TYPICAL",
        }),
      );
    }
    // Only 2 difficult cases: below MIN_FACTOR_N.
    for (let i = 0; i < 2; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 10 + i),
          durationMs: 150_000,
          complexity: "DIFFICULT",
        }),
      );
    }

    const factors = computeComplexityFactors(cases);
    expect(factors.TYPICAL.provisional).toBe(false);
    expect(factors.EASY.provisional).toBe(false);
    expect(factors.DIFFICULT.provisional).toBe(true);
    expect(factors.DIFFICULT.factor).toBe(1.0);
    expect(factors.DIFFICULT.n).toBe(2);
  });

  it("is fully provisional when no study has enough eligible cases", () => {
    const cases: CaseRecord[] = [
      mkCase({ finishedAt: BASE, durationMs: 100_000 }),
      mkCase({ finishedAt: daysFrom(BASE, 1), durationMs: 100_000 }),
    ];
    const factors = computeComplexityFactors(cases);
    expect(factors.EASY.provisional).toBe(true);
    expect(factors.TYPICAL.provisional).toBe(true);
    expect(factors.DIFFICULT.provisional).toBe(true);
    expect(factors.EASY.factor).toBe(1.0);
    expect(factors.TYPICAL.factor).toBe(1.0);
    expect(factors.DIFFICULT.factor).toBe(1.0);
  });

  it("ignores excluded cases entirely when learning factors", () => {
    const cases: CaseRecord[] = [];
    for (let i = 0; i < MIN_STUDY_N; i++) {
      cases.push(
        mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
      );
    }
    // Excluded outlier cases should not count toward study eligibility or ratios.
    for (let i = 0; i < 10; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 100 + i),
          durationMs: 999_999,
          excluded: true,
          complexity: "DIFFICULT",
        }),
      );
    }
    const factors = computeComplexityFactors(cases);
    // Only 5 eligible cases exist total (all TYPICAL) -> TYPICAL n=5 but DIFFICULT n=0.
    expect(factors.DIFFICULT.n).toBe(0);
    expect(factors.DIFFICULT.provisional).toBe(true);
  });
});

describe("adjustDuration", () => {
  it("divides raw duration by the learned factor", () => {
    const factors: ComplexityFactors = {
      EASY: { factor: 0.8, n: 10, provisional: false },
      TYPICAL: { factor: 1, n: 10, provisional: false },
      DIFFICULT: { factor: 1.5, n: 10, provisional: false },
    };
    const c = mkCase({
      finishedAt: BASE,
      durationMs: 150_000,
      complexity: "DIFFICULT",
    });
    expect(adjustDuration(c, factors)).toBeCloseTo(100_000, 5);
  });
});

describe("computeStudyStats", () => {
  it("early baseline: 1 case", () => {
    const cases = [mkCase({ finishedAt: BASE, durationMs: 600_000 })];
    const stats = computeStudyStats(cases, IDENTITY_FACTORS);
    expect(stats.totalCount).toBe(1);
    expect(stats.eligibleCount).toBe(1);
    expect(stats.maturity).toBe("EARLY");
    expect(stats.recentPaceMs).toBe(600_000);
    expect(stats.comparisonPaceMs).toBeNull();
    expect(stats.improvement).toBeNull();
    expect(stats.personalBestMs.raw).toBe(600_000);
  });

  it("early baseline: 3 cases", () => {
    const cases = [0, 1, 2].map((i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 600_000 + i * 1000 }),
    );
    const stats = computeStudyStats(cases, IDENTITY_FACTORS);
    expect(stats.totalCount).toBe(3);
    expect(stats.maturity).toBe("EARLY");
    expect(stats.comparisonPaceMs).toBeNull();
  });

  it("rolling windows: 35 cases -> recent = last 10, comparison = previous 20", () => {
    const cases = Array.from({ length: 35 }, (_, i) =>
      mkCase({
        finishedAt: daysFrom(BASE, i),
        durationMs: 1_000_000 + i * 1_000,
      }),
    );
    const stats = computeStudyStats(cases, IDENTITY_FACTORS);
    expect(stats.totalCount).toBe(35);
    expect(stats.maturity).toBe("ESTABLISHED");

    const durations = cases.map((c) => c.activeDurationMs);
    const expectedRecent = median(durations.slice(25, 35));
    const expectedComparison = median(durations.slice(5, 25));
    expect(stats.recentPaceMs).toBeCloseTo(expectedRecent as number, 5);
    expect(stats.comparisonPaceMs).toBeCloseTo(expectedComparison as number, 5);
    expect(stats.improvement).not.toBeNull();
    expect(RECENT_WINDOW).toBe(10);
    expect(COMPARISON_WINDOW).toBe(20);
  });

  it("excluded cases are ignored for benchmark windows but counted in volume/active time", () => {
    const eligible = Array.from({ length: 10 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 500_000 }),
    );
    const excluded = Array.from({ length: 3 }, (_, i) =>
      mkCase({
        finishedAt: daysFrom(BASE, 20 + i),
        durationMs: 9_999_999,
        excluded: true,
        tagIds: ["interrupted"],
      }),
    );
    const cases = [...eligible, ...excluded];
    const stats = computeStudyStats(cases, IDENTITY_FACTORS);

    expect(stats.totalCount).toBe(13);
    expect(stats.eligibleCount).toBe(10);
    expect(stats.excludedCount).toBe(3);
    // Recent pace should be exactly the eligible-only median (unaffected by excluded outliers).
    expect(stats.recentPaceMs).toBe(500_000);
    const expectedActive = [...eligible, ...excluded].reduce(
      (s, c) => s + c.activeDurationMs,
      0,
    );
    expect(stats.totalActiveMs).toBe(expectedActive);
  });

  it("personal best tracks fastest eligible read (adjusted and raw)", () => {
    const cases = [
      mkCase({ finishedAt: daysFrom(BASE, 0), durationMs: 500_000 }),
      mkCase({ finishedAt: daysFrom(BASE, 1), durationMs: 200_000 }),
      mkCase({
        finishedAt: daysFrom(BASE, 2),
        durationMs: 300_000,
        excluded: true,
      }),
    ];
    const stats = computeStudyStats(cases, IDENTITY_FACTORS);
    expect(stats.personalBestMs.raw).toBe(200_000);
    expect(stats.personalBestMs.adjusted).toBe(200_000);
  });

  it("deletion recalculation: removing a case changes recent pace", () => {
    const cases = Array.from({ length: 12 }, (_, i) =>
      mkCase({
        finishedAt: daysFrom(BASE, i),
        durationMs: 100_000 + i * 10_000,
      }),
    );
    const before = computeStudyStats(cases, IDENTITY_FACTORS);
    const afterDeletion = computeStudyStats(
      cases.slice(0, -1),
      IDENTITY_FACTORS,
    );

    expect(afterDeletion.totalCount).toBe(before.totalCount - 1);
    expect(afterDeletion.recentPaceMs).not.toBe(before.recentPaceMs);
  });

  it("combined studies are independent even when intermixed by date", () => {
    const studyA = Array.from({ length: 8 }, (_, i) =>
      mkCase({
        studyTypeId: "A",
        finishedAt: daysFrom(BASE, i * 2),
        durationMs: 100_000,
      }),
    );
    const studyB = Array.from({ length: 8 }, (_, i) =>
      mkCase({
        studyTypeId: "B",
        finishedAt: daysFrom(BASE, i * 2 + 1),
        durationMs: 900_000,
      }),
    );
    const all = [...studyA, ...studyB];

    const statsA = computeStudyStats(
      all.filter((c) => c.studyTypeId === "A"),
      IDENTITY_FACTORS,
    );
    const statsB = computeStudyStats(
      all.filter((c) => c.studyTypeId === "B"),
      IDENTITY_FACTORS,
    );

    expect(statsA.totalCount).toBe(8);
    expect(statsB.totalCount).toBe(8);
    expect(statsA.recentPaceMs).toBe(100_000);
    expect(statsB.recentPaceMs).toBe(900_000);
  });
});

describe("computeTrend", () => {
  it("buckets eligible cases by UTC week with no empty buckets", () => {
    const cases = [
      mkCase({
        finishedAt: new Date("2026-01-05T23:59:00.000Z"),
        durationMs: 100_000,
      }), // Monday
      mkCase({
        finishedAt: new Date("2026-01-06T00:01:00.000Z"),
        durationMs: 200_000,
      }), // Tuesday, same ISO week
      mkCase({
        finishedAt: new Date("2026-01-20T00:00:00.000Z"),
        durationMs: 300_000,
      }), // several weeks later
      mkCase({
        finishedAt: new Date("2026-01-20T05:00:00.000Z"),
        durationMs: 999_999,
        excluded: true,
      }),
    ];
    const points = computeTrend(cases, IDENTITY_FACTORS, "week");
    // Only two non-empty weekly buckets should appear (excluded case ignored).
    expect(points.length).toBe(2);
    expect(points[0].count).toBe(2);
    expect(points[0].rawMedianMs).toBe(150_000);
    expect(points[1].count).toBe(1);
    // Points sorted ascending.
    expect(points[0].bucketStart < points[1].bucketStart).toBe(true);
  });

  it("is timezone independent: uses UTC calendar boundaries regardless of local offsets encoded in the Date", () => {
    // 2026-01-01 is a Thursday UTC; same UTC week for the first 4 days.
    const cases = [
      mkCase({
        finishedAt: new Date("2026-01-01T00:00:00.000Z"),
        durationMs: 100_000,
      }),
      mkCase({
        finishedAt: new Date("2026-01-04T23:59:59.999Z"),
        durationMs: 200_000,
      }),
    ];
    const points = computeTrend(cases, IDENTITY_FACTORS, "week");
    expect(points.length).toBe(1);
    expect(points[0].bucketStart).toBe("2025-12-29"); // Monday of that ISO week, UTC
  });

  it("buckets by month", () => {
    const cases = [
      mkCase({
        finishedAt: new Date("2026-01-15T00:00:00.000Z"),
        durationMs: 100_000,
      }),
      mkCase({
        finishedAt: new Date("2026-02-01T00:00:00.000Z"),
        durationMs: 200_000,
      }),
    ];
    const points = computeTrend(cases, IDENTITY_FACTORS, "month");
    expect(points.map((p) => p.bucketStart)).toEqual([
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("personalPercentile", () => {
  it("returns null with no eligible priors", () => {
    const target = mkCase({ finishedAt: BASE, durationMs: 100_000 });
    expect(personalPercentile(target, [], IDENTITY_FACTORS)).toBeNull();
  });

  it("computes fraction of priors slower than target", () => {
    const priors = [200_000, 300_000, 50_000, 400_000].map((d, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: d }),
    );
    const target = mkCase({
      finishedAt: daysFrom(BASE, 10),
      durationMs: 250_000,
    });
    // priors slower than 250_000: 300_000, 400_000 -> 2 of 4 = 0.5
    expect(personalPercentile(target, priors, IDENTITY_FACTORS)).toBeCloseTo(
      0.5,
      10,
    );
  });

  it("excludes non-eligible priors", () => {
    const priors = [
      mkCase({
        finishedAt: daysFrom(BASE, 0),
        durationMs: 1_000_000,
        excluded: true,
      }),
      mkCase({ finishedAt: daysFrom(BASE, 1), durationMs: 300_000 }),
    ];
    const target = mkCase({
      finishedAt: daysFrom(BASE, 2),
      durationMs: 250_000,
    });
    expect(personalPercentile(target, priors, IDENTITY_FACTORS)).toBe(1);
  });
});

describe("postCaseFeedback", () => {
  it("first ever case: BASELINE_STARTED", () => {
    const target = mkCase({ finishedAt: BASE, durationMs: 100_000 });
    const fb = postCaseFeedback(target, [target], IDENTITY_FACTORS);
    expect(fb.kind).toBe("BASELINE_STARTED");
    expect(fb.caseNumber).toBe(1);
    expect(formatFeedbackText(fb)).toBe("Personal baseline started");
  });

  it("case 3 with fewer than MIN_STUDY_N priors: BASELINE_BUILDING", () => {
    const c1 = mkCase({ finishedAt: daysFrom(BASE, 0), durationMs: 100_000 });
    const c2 = mkCase({ finishedAt: daysFrom(BASE, 1), durationMs: 100_000 });
    const c3 = mkCase({ finishedAt: daysFrom(BASE, 2), durationMs: 100_000 });
    const fb = postCaseFeedback(c3, [c1, c2, c3], IDENTITY_FACTORS);
    expect(fb.kind).toBe("BASELINE_BUILDING");
    expect(fb.caseNumber).toBe(3);
    expect(formatFeedbackText(fb)).toBe("Baseline building — case 3");
  });

  it("once enough prior eligible cases exist: COMPARISON, faster wording", () => {
    const priors = Array.from({ length: 10 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    const target = mkCase({
      finishedAt: daysFrom(BASE, 20),
      durationMs: 92_000,
    });
    const fb = postCaseFeedback(target, [...priors, target], IDENTITY_FACTORS);
    expect(fb.kind).toBe("COMPARISON");
    expect(fb.percentVsRecent).toBeCloseTo(0.08, 5);
    const text = formatFeedbackText(fb);
    expect(text).toBe("8% faster than your recent comparable pace");
    expect(text).not.toMatch(/slow|failed/i);
  });

  it('slower than recent pace uses calm "above" wording, never "slow"', () => {
    const priors = Array.from({ length: 10 }, (_, i) =>
      mkCase({ finishedAt: daysFrom(BASE, i), durationMs: 100_000 }),
    );
    const target = mkCase({
      finishedAt: daysFrom(BASE, 20),
      durationMs: 106_000,
    });
    const fb = postCaseFeedback(target, [...priors, target], IDENTITY_FACTORS);
    const text = formatFeedbackText(fb);
    expect(text).toBe("6% above your recent comparable pace");
    expect(text).not.toMatch(/slow|failed/i);
  });
});

describe("postCaseFeedback adjustedDurationMs (R1)", () => {
  // Single-study fixture where the learned complexity factors are exact:
  // 5 EASY @ 5:00 (300_000ms), 10 TYPICAL @ 10:00 (600_000ms), 5 DIFFICULT
  // @ 20:00 (1_200_000ms). Sorted by duration, the study median falls
  // inside the TYPICAL block (positions 10-11 of 20), so
  // studyMedian = 600_000 and every ratio is exact: EASY = 0.5,
  // TYPICAL = 1, DIFFICULT = 2. Crucially, every prior case's *adjusted*
  // duration is therefore exactly 600_000ms regardless of its complexity,
  // so the last-10-priors recent pace is unambiguously 10:00.
  function buildFactorHistory(): CaseRecord[] {
    const cases: CaseRecord[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, i),
          durationMs: 300_000,
          complexity: "EASY",
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 5 + i),
          durationMs: 600_000,
          complexity: "TYPICAL",
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      cases.push(
        mkCase({
          finishedAt: daysFrom(BASE, 15 + i),
          durationMs: 1_200_000,
          complexity: "DIFFICULT",
        }),
      );
    }
    return cases;
  }

  it("learns exact factors EASY=0.5, TYPICAL=1, DIFFICULT=2 from the fixture", () => {
    const factors = computeComplexityFactors(buildFactorHistory());
    expect(factors.EASY.factor).toBeCloseTo(0.5, 10);
    expect(factors.TYPICAL.factor).toBeCloseTo(1, 10);
    expect(factors.DIFFICULT.factor).toBeCloseTo(2, 10);
    expect(factors.EASY.provisional).toBe(false);
    expect(factors.TYPICAL.provisional).toBe(false);
    expect(factors.DIFFICULT.provisional).toBe(false);
  });

  it("Difficult raw 15:00 vs recent (adjusted) 10:00 with factor 2 -> adjusted 07:30, 25% faster", () => {
    const history = buildFactorHistory();
    const factors = computeComplexityFactors(history);

    const target = mkCase({
      finishedAt: daysFrom(BASE, 30),
      durationMs: 900_000, // 15:00 raw
      complexity: "DIFFICULT",
    });
    const fb = postCaseFeedback(target, [...history, target], factors);

    expect(fb.kind).toBe("COMPARISON");
    expect(fb.recentPaceMs).toBe(600_000); // 10:00, adjusted
    expect(fb.adjustedDurationMs).toBe(450_000); // 07:30
    expect(formatDuration(fb.adjustedDurationMs as number)).toBe("07:30");
    expect(fb.percentVsRecent).toBeCloseTo(0.25, 10);
    expect(formatFeedbackText(fb)).toBe(
      "25% faster than your recent comparable pace",
    );
  });

  it("Easy raw 06:00 with factor 0.5 -> adjusted 12:00, 20% above recent pace", () => {
    const history = buildFactorHistory();
    const factors = computeComplexityFactors(history);

    const target = mkCase({
      finishedAt: daysFrom(BASE, 30),
      durationMs: 360_000, // 06:00 raw
      complexity: "EASY",
    });
    const fb = postCaseFeedback(target, [...history, target], factors);

    expect(fb.kind).toBe("COMPARISON");
    expect(fb.recentPaceMs).toBe(600_000); // 10:00, adjusted
    expect(fb.adjustedDurationMs).toBe(720_000); // 12:00
    expect(formatDuration(fb.adjustedDurationMs as number)).toBe("12:00");
    expect(fb.percentVsRecent).toBeCloseTo(-0.2, 10);
    expect(formatFeedbackText(fb)).toBe(
      "20% above your recent comparable pace",
    );
  });

  it("reclassifying the same raw duration changes adjustedDurationMs", () => {
    const history = buildFactorHistory();
    const factors = computeComplexityFactors(history);
    const finishedAt = daysFrom(BASE, 30);
    const rawMs = 600_000;

    const asTypical = postCaseFeedback(
      mkCase({ finishedAt, durationMs: rawMs, complexity: "TYPICAL" }),
      [
        ...history,
        mkCase({ finishedAt, durationMs: rawMs, complexity: "TYPICAL" }),
      ],
      factors,
    );
    const target = mkCase({
      finishedAt,
      durationMs: rawMs,
      complexity: "DIFFICULT",
    });
    const asDifficult = postCaseFeedback(target, [...history, target], factors);

    expect(asTypical.adjustedDurationMs).toBe(600_000);
    expect(asDifficult.adjustedDurationMs).toBe(300_000);
    expect(asDifficult.adjustedDurationMs).not.toBe(
      asTypical.adjustedDurationMs,
    );
  });

  it("BASELINE_STARTED/BASELINE_BUILDING have no adjustedDurationMs (no comparison graphic)", () => {
    const target = mkCase({ finishedAt: BASE, durationMs: 100_000 });
    const started = postCaseFeedback(target, [target], IDENTITY_FACTORS);
    expect(started.adjustedDurationMs).toBeNull();

    const c1 = mkCase({ finishedAt: daysFrom(BASE, 0), durationMs: 100_000 });
    const c2 = mkCase({ finishedAt: daysFrom(BASE, 1), durationMs: 100_000 });
    const c3 = mkCase({ finishedAt: daysFrom(BASE, 2), durationMs: 100_000 });
    const building = postCaseFeedback(c3, [c1, c2, c3], IDENTITY_FACTORS);
    expect(building.adjustedDurationMs).toBeNull();
  });
});

describe("computeOverview and reading day streaks", () => {
  it("computes consecutive UTC day streaks, current relative to now", () => {
    const days = [0, 1, 2, 3, 4]; // 5 consecutive days
    const cases = days.map((d) =>
      mkCase({ finishedAt: daysFrom(BASE, d), durationMs: 100_000 }),
    );
    const now = daysFrom(BASE, 4); // same day as last activity
    const overview = computeOverview(cases, now);
    expect(overview.completedCases).toBe(5);
    expect(overview.readingDayStreak.longest).toBe(5);
    expect(overview.readingDayStreak.current).toBe(5);
  });

  it("current streak resets to 0 once too much time has passed since last activity", () => {
    const days = [0, 1, 2];
    const cases = days.map((d) =>
      mkCase({ finishedAt: daysFrom(BASE, d), durationMs: 100_000 }),
    );
    const now = daysFrom(BASE, 10); // long after last activity
    const overview = computeOverview(cases, now);
    expect(overview.readingDayStreak.longest).toBe(3);
    expect(overview.readingDayStreak.current).toBe(0);
  });

  it("longest streak survives gaps even when current streak is shorter", () => {
    const cases = [0, 1, 2, 3, 10, 11].map((d) =>
      mkCase({ finishedAt: daysFrom(BASE, d), durationMs: 100_000 }),
    );
    const now = daysFrom(BASE, 11);
    const overview = computeOverview(cases, now);
    expect(overview.readingDayStreak.longest).toBe(4);
    expect(overview.readingDayStreak.current).toBe(2);
  });

  it("is timezone independent: multiple cases within the same UTC day count once", () => {
    const cases = [
      mkCase({
        finishedAt: new Date("2026-01-01T00:05:00.000Z"),
        durationMs: 100_000,
      }),
      mkCase({
        finishedAt: new Date("2026-01-01T23:55:00.000Z"),
        durationMs: 100_000,
      }),
      mkCase({
        finishedAt: new Date("2026-01-02T00:05:00.000Z"),
        durationMs: 100_000,
      }),
    ];
    const now = new Date("2026-01-02T00:05:00.000Z");
    const overview = computeOverview(cases, now);
    expect(overview.readingDayStreak.longest).toBe(2);
  });

  it("includes excluded cases in volume and active time (timedCasesPerHour uses all completed cases)", () => {
    const cases = [
      mkCase({ finishedAt: BASE, durationMs: 3_600_000 }),
      mkCase({
        finishedAt: daysFrom(BASE, 1),
        durationMs: 3_600_000,
        excluded: true,
      }),
    ];
    const overview = computeOverview(cases, daysFrom(BASE, 1));
    expect(overview.completedCases).toBe(2);
    expect(overview.totalActiveMs).toBe(7_200_000);
    expect(overview.timedCasesPerHour).toBeCloseTo(1, 5);
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as mm:ss", () => {
    expect(formatDuration(62_000)).toBe("01:02");
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(402_000)).toBe("06:42");
  });
  it("formats hour+ durations as h:mm:ss", () => {
    expect(formatDuration(3_661_000)).toBe("1:01:01");
    expect(formatDuration(3_600_000 * 2 + 65_000)).toBe("2:01:05");
  });
});

describe("formatPercent", () => {
  it("formats with at most 1 decimal", () => {
    expect(formatPercent(0.08)).toBe("8");
    expect(formatPercent(0.083)).toBe("8.3");
    expect(formatPercent(0.0)).toBe("0");
    expect(formatPercent(0.12345)).toBe("12.3");
  });
});
