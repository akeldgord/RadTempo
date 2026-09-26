import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql as rawSql, db } from "@/db";
import * as studiesService from "@/features/studies/service";
import * as tagsService from "@/features/tags/service";
import * as timerService from "@/features/timer/service";
import { timingEntries, timingPauseEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ImmutableError, NotFoundError } from "@/server/errors";
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

describe("startTimer", () => {
  it("creates an ACTIVE entry", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    const { timer, existing } = await timerService.startTimer(
      db,
      userId,
      study.id,
    );

    expect(existing).toBe(false);
    expect(timer.status).toBe("ACTIVE");
    expect(timer.studyTypeId).toBe(study.id);
    expect(timer.pausedDurationMs).toBe(0);
  });

  it("returns the existing timer instead of creating a second one", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const other = await makeStudyType(userId, "CT Chest -C");

    const first = await timerService.startTimer(db, userId, study.id);
    const second = await timerService.startTimer(db, userId, other.id);

    expect(second.existing).toBe(true);
    expect(second.timer.id).toBe(first.timer.id);
    expect(second.timer.studyTypeId).toBe(study.id);

    const rows = await db
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("handles a concurrent-start race: 5 simultaneous starts produce exactly one row", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        timerService.startTimer(db, userId, study.id),
      ),
    );

    const ids = new Set(results.map((r) => r.timer.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => !r.existing)).toHaveLength(1);

    const rows = await db
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("finalizes any previously-unfinalized COMPLETED entry (starting another case finalizes the previous panel)", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);

    const { timer } = await timerService.startTimer(db, userId, study.id);
    const { entry } = await timerService.finishTimer(db, userId, timer.id);
    expect(entry.classificationFinalizedAt).toBeNull();

    await timerService.startTimer(db, userId, study.id);

    const rows = await db
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.id, entry.id));
    expect(rows[0].classificationFinalizedAt).not.toBeNull();
  });
});

describe("pause / resume", () => {
  it("pauses an ACTIVE timer and is idempotent when paused twice", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);

    const pausedOnce = await timerService.pauseTimer(db, userId, timer.id);
    expect(pausedOnce.status).toBe("PAUSED");
    expect(pausedOnce.pauseStartedAt).not.toBeNull();

    const pausedTwice = await timerService.pauseTimer(db, userId, timer.id);
    expect(pausedTwice.status).toBe("PAUSED");
    expect(pausedTwice.pauseStartedAt?.getTime()).toBe(
      pausedOnce.pauseStartedAt?.getTime(),
    );

    const pauseEvents = await db
      .select()
      .from(timingPauseEvents)
      .where(eq(timingPauseEvents.timingEntryId, timer.id));
    expect(pauseEvents).toHaveLength(1);
  });

  it("resumes a PAUSED timer, accumulating paused_duration_ms, and is idempotent when resumed twice", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const start = new Date("2026-01-01T00:00:00Z");
    const { timer } = await timerService.startTimer(
      db,
      userId,
      study.id,
      start,
    );

    const pauseAt = new Date(start.getTime() + 5_000);
    await timerService.pauseTimer(db, userId, timer.id, pauseAt);

    const resumeAt = new Date(pauseAt.getTime() + 30_000);
    const resumedOnce = await timerService.resumeTimer(
      db,
      userId,
      timer.id,
      resumeAt,
    );
    expect(resumedOnce.status).toBe("ACTIVE");
    expect(resumedOnce.pausedDurationMs).toBe(30_000);
    expect(resumedOnce.pauseStartedAt).toBeNull();

    const resumedTwice = await timerService.resumeTimer(
      db,
      userId,
      timer.id,
      new Date(resumeAt.getTime() + 60_000),
    );
    expect(resumedTwice.pausedDurationMs).toBe(30_000);

    const pauseEvents = await db
      .select()
      .from(timingPauseEvents)
      .where(eq(timingPauseEvents.timingEntryId, timer.id));
    expect(pauseEvents).toHaveLength(1);
    expect(pauseEvents[0].resumedAt?.getTime()).toBe(resumeAt.getTime());
  });

  it("never attaches a tag from pause/resume alone", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);
    await timerService.pauseTimer(db, userId, timer.id);
    await timerService.resumeTimer(db, userId, timer.id);
    const { entry } = await timerService.finishTimer(db, userId, timer.id);
    expect(entry.tagIds).toEqual([]);
  });
});

describe("finishTimer", () => {
  it("computes exact duration for a plain (never paused) case", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const start = new Date("2026-01-01T00:00:00Z");
    const { timer } = await timerService.startTimer(
      db,
      userId,
      study.id,
      start,
    );

    const finishAt = new Date(start.getTime() + 90_000);
    const { entry } = await timerService.finishTimer(
      db,
      userId,
      timer.id,
      finishAt,
    );

    expect(entry.status).toBe("COMPLETED");
    expect(entry.activeDurationMs).toBe(90_000);
    expect(entry.complexity).toBe("TYPICAL");
    expect(entry.tagIds).toEqual([]);
  });

  it("finish while paused excludes paused time up to pause_started_at, even if Finish is clicked much later", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const start = new Date("2026-01-01T00:00:00Z");
    const { timer } = await timerService.startTimer(
      db,
      userId,
      study.id,
      start,
    );

    // Active for 20s, then paused.
    const pauseAt = new Date(start.getTime() + 20_000);
    await timerService.pauseTimer(db, userId, timer.id, pauseAt);

    // Finish is clicked 5 minutes later, while still paused: none of that
    // 5 minutes should count.
    const finishClickedAt = new Date(pauseAt.getTime() + 300_000);
    const { entry } = await timerService.finishTimer(
      db,
      userId,
      timer.id,
      finishClickedAt,
    );

    expect(entry.finishedAt.getTime()).toBe(pauseAt.getTime());
    expect(entry.activeDurationMs).toBe(20_000);
  });

  it("is idempotent: finishing an already-COMPLETED entry returns the same result", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);

    const first = await timerService.finishTimer(db, userId, timer.id);
    const second = await timerService.finishTimer(db, userId, timer.id);

    expect(second.entry.activeDurationMs).toBe(first.entry.activeDurationMs);
    expect(second.entry.finishedAt.getTime()).toBe(
      first.entry.finishedAt.getTime(),
    );
  });

  it("produces baseline-started feedback for a user's very first case", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);
    const { feedback } = await timerService.finishTimer(db, userId, timer.id);
    expect(feedback.kind).toBe("BASELINE_STARTED");
  });
});

describe("recovery", () => {
  it("getActiveTimer reflects the persisted state after a simulated refresh", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);
    await timerService.pauseTimer(db, userId, timer.id);

    // Simulate a page refresh: a fresh read with no prior in-memory state.
    const recovered = await timerService.getActiveTimer(db, userId);
    expect(recovered).not.toBeNull();
    expect(recovered?.id).toBe(timer.id);
    expect(recovered?.status).toBe("PAUSED");
  });

  it("returns null when there is no active timer", async () => {
    const userId = await createTestUser();
    const recovered = await timerService.getActiveTimer(db, userId);
    expect(recovered).toBeNull();
  });
});

describe("timezone independence", () => {
  it("computes the same duration regardless of process.env.TZ", async () => {
    const originalTz = process.env.TZ;
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const start = new Date("2026-06-15T23:30:00Z"); // crosses a local midnight in many zones

    try {
      process.env.TZ = "America/Los_Angeles";
      const { timer } = await timerService.startTimer(
        db,
        userId,
        study.id,
        start,
      );
      const { entry } = await timerService.finishTimer(
        db,
        userId,
        timer.id,
        new Date(start.getTime() + 3_723_000),
      );
      expect(entry.activeDurationMs).toBe(3_723_000);
      expect(entry.finishedAt.toISOString()).toBe(
        new Date(start.getTime() + 3_723_000).toISOString(),
      );
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("classification window and immutability", () => {
  it("allows classifying complexity and tags within the window", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const tag = await tagsService.createTag(db, userId, { name: "Custom" });
    const start = new Date("2026-01-01T00:00:00Z");
    const { timer } = await timerService.startTimer(
      db,
      userId,
      study.id,
      start,
    );
    const { entry } = await timerService.finishTimer(
      db,
      userId,
      timer.id,
      new Date(start.getTime() + 10_000),
    );

    const classifyAt = new Date(entry.finishedAt.getTime() + 60_000); // 1 min later
    const updated = await timerService.classifyEntry(
      db,
      userId,
      entry.id,
      { complexity: "DIFFICULT", tagIds: [tag.id] },
      classifyAt,
    );

    expect(updated.complexity).toBe("DIFFICULT");
    expect(updated.tagIds).toEqual([tag.id]);
  });

  it("rejects classification after the 10-minute window and finalizes the entry", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const start = new Date("2026-01-01T00:00:00Z");
    const { timer } = await timerService.startTimer(
      db,
      userId,
      study.id,
      start,
    );
    const { entry } = await timerService.finishTimer(
      db,
      userId,
      timer.id,
      new Date(start.getTime() + 10_000),
    );

    const tooLate = new Date(
      entry.finishedAt.getTime() +
        timerService.CLASSIFICATION_WINDOW_MS +
        1_000,
    );

    await expect(
      timerService.classifyEntry(
        db,
        userId,
        entry.id,
        { complexity: "EASY" },
        tooLate,
      ),
    ).rejects.toBeInstanceOf(ImmutableError);

    const rows = await db
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.id, entry.id));
    expect(rows[0].classificationFinalizedAt).not.toBeNull();
    expect(rows[0].complexity).toBe("TYPICAL");
  });

  it("rejects classification once finalized, even within the window", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);
    const { entry } = await timerService.finishTimer(db, userId, timer.id);

    await timerService.finalizeClassification(db, userId, entry.id);

    await expect(
      timerService.classifyEntry(db, userId, entry.id, { complexity: "EASY" }),
    ).rejects.toBeInstanceOf(ImmutableError);
  });

  it("finalizeClassification is idempotent", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);
    const { entry } = await timerService.finishTimer(db, userId, timer.id);

    const first = await timerService.finalizeClassification(
      db,
      userId,
      entry.id,
    );
    const second = await timerService.finalizeClassification(
      db,
      userId,
      entry.id,
    );
    expect(second.classificationFinalizedAt?.getTime()).toBe(
      first.classificationFinalizedAt?.getTime(),
    );
  });

  it("rejects classifying an ACTIVE (not yet completed) entry", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);

    await expect(
      timerService.classifyEntry(db, userId, timer.id, { complexity: "EASY" }),
    ).rejects.toBeInstanceOf(ImmutableError);
  });
});

describe("discard and delete", () => {
  it("discards an ACTIVE/PAUSED entry outright", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);

    await timerService.discardActiveTimer(db, userId, timer.id);

    const rows = await db
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.id, timer.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes a COMPLETED entry, but rejects deleting an ACTIVE one via deleteEntry", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const { timer } = await timerService.startTimer(db, userId, study.id);

    await expect(
      timerService.deleteEntry(db, userId, timer.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listHistory", () => {
  it("filters by included/excluded via exclude_from_benchmark tags", async () => {
    const userId = await createTestUser();
    const study = await makeStudyType(userId);
    const excludeTag = await tagsService.createTag(db, userId, {
      name: "Interrupted",
      excludeFromBenchmark: true,
    });

    const start = new Date("2026-01-01T00:00:00Z");
    const first = await timerService.startTimer(db, userId, study.id, start);
    const finished1 = await timerService.finishTimer(
      db,
      userId,
      first.timer.id,
      new Date(start.getTime() + 1000),
    );
    await timerService.classifyEntry(
      db,
      userId,
      finished1.entry.id,
      { tagIds: [excludeTag.id] },
      new Date(finished1.entry.finishedAt.getTime() + 1000),
    );

    const secondStart = new Date(start.getTime() + 60_000);
    const second = await timerService.startTimer(
      db,
      userId,
      study.id,
      secondStart,
    );
    await timerService.finishTimer(
      db,
      userId,
      second.timer.id,
      new Date(secondStart.getTime() + 1000),
    );

    const included = await timerService.listHistory(db, userId, {
      included: true,
    });
    const excluded = await timerService.listHistory(db, userId, {
      included: false,
    });

    expect(included).toHaveLength(1);
    expect(included[0].id).toBe(second.timer.id);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].id).toBe(finished1.entry.id);
  });
});
