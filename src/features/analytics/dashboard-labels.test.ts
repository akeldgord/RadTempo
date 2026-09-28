import { describe, expect, it } from "vitest";
import {
  maturityLabel,
  readsCountLabel,
  trendNoteState,
} from "./dashboard-labels";
import type { StudyStats } from "./types";

/** Builds a full StudyStats with sane defaults, overridable per test —
 * only the fields the functions under test actually read matter. */
function mkStats(overrides: Partial<StudyStats>): StudyStats {
  return {
    totalCount: 0,
    eligibleCount: 0,
    excludedCount: 0,
    recentPaceMs: null,
    comparisonPaceMs: null,
    improvement: null,
    benchmarkMs: null,
    maturity: "NONE",
    personalBestMs: { adjusted: null, raw: null },
    rawMedianMs: null,
    adjustedMedianMs: null,
    complexityDistribution: { EASY: 0, TYPICAL: 0, DIFFICULT: 0 },
    casesPerHour: null,
    totalActiveMs: 0,
    ...overrides,
  };
}

describe("readsCountLabel", () => {
  it("shows just the total when nothing is excluded", () => {
    expect(
      readsCountLabel(
        mkStats({ totalCount: 5, eligibleCount: 5, excludedCount: 0 }),
      ),
    ).toBe("5 reads");
  });

  it("singularizes a single read", () => {
    expect(
      readsCountLabel(
        mkStats({ totalCount: 1, eligibleCount: 1, excludedCount: 0 }),
      ),
    ).toBe("1 read");
  });

  it("makes the comparable count explicit once any reads are excluded", () => {
    expect(
      readsCountLabel(
        mkStats({ totalCount: 3, eligibleCount: 1, excludedCount: 2 }),
      ),
    ).toBe("3 reads, 1 comparable");
  });

  it("shows the comparable count even when it is zero (all excluded)", () => {
    expect(
      readsCountLabel(
        mkStats({ totalCount: 2, eligibleCount: 0, excludedCount: 2 }),
      ),
    ).toBe("2 reads, 0 comparable");
  });
});

describe("maturityLabel", () => {
  it("never claims Early/Building/Established when eligibleCount is 0, regardless of stored maturity", () => {
    expect(maturityLabel({ eligibleCount: 0, maturity: "EARLY" })).toBe(
      "Not yet comparable",
    );
    expect(maturityLabel({ eligibleCount: 0, maturity: "NONE" })).toBe(
      "Not yet comparable",
    );
  });

  it("labels each maturity bucket once there is comparable history", () => {
    expect(maturityLabel({ eligibleCount: 1, maturity: "EARLY" })).toBe(
      "Early",
    );
    expect(maturityLabel({ eligibleCount: 5, maturity: "BUILDING" })).toBe(
      "Building",
    );
    expect(maturityLabel({ eligibleCount: 15, maturity: "ESTABLISHED" })).toBe(
      "Established",
    );
  });
});

describe("trendNoteState", () => {
  it("one excluded case, nothing else: NO_COMPARABLE (not baseline started)", () => {
    const state = trendNoteState(
      mkStats({ eligibleCount: 0, improvement: null, comparisonPaceMs: null }),
    );
    expect(state.kind).toBe("NO_COMPARABLE");
  });

  it("multiple excluded cases, nothing eligible: still NO_COMPARABLE", () => {
    const state = trendNoteState(
      mkStats({ eligibleCount: 0, improvement: null, comparisonPaceMs: null }),
    );
    expect(state.kind).toBe("NO_COMPARABLE");
  });

  it("one eligible case plus excluded history: BASELINE_STARTED, not a percent claim", () => {
    const state = trendNoteState(
      mkStats({ eligibleCount: 1, improvement: null, comparisonPaceMs: null }),
    );
    expect(state.kind).toBe("BASELINE_STARTED");
  });

  it("several eligible cases but not enough for a comparison window: BASELINE_FORMING", () => {
    const state = trendNoteState(
      mkStats({ eligibleCount: 4, improvement: null, comparisonPaceMs: null }),
    );
    expect(state.kind).toBe("BASELINE_FORMING");
  });

  it("established: COMPARISON with the improvement fraction, direction preserved", () => {
    const faster = trendNoteState(
      mkStats({
        eligibleCount: 30,
        improvement: 0.12,
        comparisonPaceMs: 100_000,
      }),
    );
    expect(faster).toEqual({ kind: "COMPARISON", faster: true, percent: 0.12 });

    const slower = trendNoteState(
      mkStats({
        eligibleCount: 30,
        improvement: -0.05,
        comparisonPaceMs: 100_000,
      }),
    );
    expect(slower).toEqual({
      kind: "COMPARISON",
      faster: false,
      percent: 0.05,
    });
  });
});
