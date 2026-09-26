/**
 * Timer service: the one-active-timer-per-user state machine. The database
 * is authoritative — every mutation here is transactional and idempotent
 * where the SPEC calls for it. See docs/SPEC.md, sections "Timer",
 * "Post-case panel", and "Immutability".
 */

import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  tags as tagsTable,
  timingEntries,
  timingEntryTags,
  timingPauseEvents,
  userStudyTypes,
} from "@/db/schema";
import {
  computeComplexityFactors,
  formatDuration,
  formatFeedbackText,
  postCaseFeedback,
} from "@/features/analytics/engine";
import { loadUserCases } from "@/features/analytics/repository";
import type {
  CaseRecord,
  Complexity,
  PostCaseFeedback,
} from "@/features/analytics/types";
import { assertOwnsTags } from "@/features/tags/service";
import {
  ImmutableError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";

export const CLASSIFICATION_WINDOW_MS = 10 * 60 * 1000;

export type TimerStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface TimerState {
  id: string;
  studyTypeId: string;
  studyName: string;
  shortName: string;
  status: TimerStatus;
  startedAt: Date;
  pauseStartedAt: Date | null;
  pausedDurationMs: number;
  /** The server's clock at the moment this state was read. The client
   * renders elapsed time from this + startedAt/pausedDurationMs; it never
   * trusts its own clock as the source of truth. */
  serverNow: Date;
}

export interface CompletedEntrySummary {
  id: string;
  studyTypeId: string;
  studyName: string;
  shortName: string;
  status: "COMPLETED";
  startedAt: Date;
  finishedAt: Date;
  activeDurationMs: number;
  complexity: Complexity;
  classificationFinalizedAt: Date | null;
  tagIds: string[];
}

export interface FinishResult {
  entry: CompletedEntrySummary;
  feedback: PostCaseFeedback;
  feedbackText: string;
  durationText: string;
}

type EntryRow = typeof timingEntries.$inferSelect;

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  if (record.cause) return pgErrorCode(record.cause);
  return undefined;
}

/** True for Postgres error 23505 (unique_violation), including when it
 * arrives wrapped in drizzle-orm's `DrizzleQueryError.cause`. */
function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

function isPastClassificationWindow(finishedAt: Date, now: Date): boolean {
  return now.getTime() - finishedAt.getTime() > CLASSIFICATION_WINDOW_MS;
}

function buildTimerState(
  entry: EntryRow,
  studyName: string,
  shortName: string,
  now: Date,
): TimerState {
  return {
    id: entry.id,
    studyTypeId: entry.studyTypeId,
    studyName,
    shortName,
    status: entry.status,
    startedAt: entry.startedAt,
    pauseStartedAt: entry.pauseStartedAt,
    pausedDurationMs: entry.pausedDurationMs,
    serverNow: now,
  };
}

async function loadEntryTagIds(
  db: DbClient,
  entryId: string,
): Promise<string[]> {
  const rows = await db
    .select({ tagId: timingEntryTags.tagId })
    .from(timingEntryTags)
    .where(eq(timingEntryTags.timingEntryId, entryId));
  return rows.map((r) => r.tagId);
}

async function buildCompletedSummary(
  db: DbClient,
  entry: EntryRow,
  studyName: string,
  shortName: string,
): Promise<CompletedEntrySummary> {
  if (entry.finishedAt == null || entry.activeDurationMs == null) {
    throw new ValidationError("Entry is not completed");
  }
  const tagIds = await loadEntryTagIds(db, entry.id);
  return {
    id: entry.id,
    studyTypeId: entry.studyTypeId,
    studyName,
    shortName,
    status: "COMPLETED",
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    activeDurationMs: entry.activeDurationMs,
    complexity: entry.complexity,
    classificationFinalizedAt: entry.classificationFinalizedAt,
    tagIds,
  };
}

interface OwnedEntryWithStudy {
  entry: EntryRow;
  studyName: string;
  shortName: string;
}

async function getOwnedEntryWithStudy(
  db: DbClient,
  userId: string,
  entryId: string,
): Promise<OwnedEntryWithStudy> {
  const rows = await db
    .select({
      entry: timingEntries,
      studyName: userStudyTypes.name,
      shortName: userStudyTypes.shortName,
    })
    .from(timingEntries)
    .innerJoin(userStudyTypes, eq(timingEntries.studyTypeId, userStudyTypes.id))
    .where(and(eq(timingEntries.id, entryId), eq(timingEntries.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Timing entry not found");
  return row;
}

// ---------------------------------------------------------------------------
// Active timer read / start
// ---------------------------------------------------------------------------

/** The user's current ACTIVE or PAUSED timer, or null if none. Safe to poll. */
export async function getActiveTimer(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<TimerState | null> {
  const rows = await db
    .select({
      entry: timingEntries,
      studyName: userStudyTypes.name,
      shortName: userStudyTypes.shortName,
    })
    .from(timingEntries)
    .innerJoin(userStudyTypes, eq(timingEntries.studyTypeId, userStudyTypes.id))
    .where(
      and(
        eq(timingEntries.userId, userId),
        inArray(timingEntries.status, ["ACTIVE", "PAUSED"]),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return buildTimerState(row.entry, row.studyName, row.shortName, now);
}

/**
 * Starts a new timer for `studyTypeId`, or returns the user's existing
 * ACTIVE/PAUSED timer if one already exists (`existing: true`) — including
 * when that already-existing row appears via a concurrent-start race caught
 * by the partial unique index (Postgres error 23505). Finalizes any
 * previously-unfinalized COMPLETED entries first, so starting a new case
 * always finalizes the previous post-case panel.
 */
export async function startTimer(
  db: DbClient,
  userId: string,
  studyTypeId: string,
  now: Date = new Date(),
): Promise<{ timer: TimerState; existing: boolean }> {
  const owned = await db
    .select({ id: userStudyTypes.id })
    .from(userStudyTypes)
    .where(
      and(
        eq(userStudyTypes.id, studyTypeId),
        eq(userStudyTypes.userId, userId),
      ),
    )
    .limit(1);
  if (!owned[0]) throw new NotFoundError("Study type not found");

  return db.transaction(async (tx) => {
    await tx
      .update(timingEntries)
      .set({ classificationFinalizedAt: now })
      .where(
        and(
          eq(timingEntries.userId, userId),
          eq(timingEntries.status, "COMPLETED"),
          sql`${timingEntries.classificationFinalizedAt} IS NULL`,
        ),
      );

    const existingRows = await tx
      .select({
        entry: timingEntries,
        studyName: userStudyTypes.name,
        shortName: userStudyTypes.shortName,
      })
      .from(timingEntries)
      .innerJoin(
        userStudyTypes,
        eq(timingEntries.studyTypeId, userStudyTypes.id),
      )
      .where(
        and(
          eq(timingEntries.userId, userId),
          inArray(timingEntries.status, ["ACTIVE", "PAUSED"]),
        ),
      )
      .limit(1);
    if (existingRows[0]) {
      const row = existingRows[0];
      return {
        timer: buildTimerState(row.entry, row.studyName, row.shortName, now),
        existing: true,
      };
    }

    try {
      // A unique_violation aborts the whole enclosing transaction in
      // Postgres (every later statement in it errors with "current
      // transaction is aborted"), so the insert runs in its own SAVEPOINT
      // (a nested drizzle transaction) — only that savepoint rolls back on
      // a race, leaving `tx` itself usable for the re-select below.
      const inserted = await tx.transaction((tx2) =>
        tx2
          .insert(timingEntries)
          .values({
            userId,
            studyTypeId,
            status: "ACTIVE",
            startedAt: now,
            pausedDurationMs: 0,
          })
          .returning(),
      );
      const studyRows = await tx
        .select({
          name: userStudyTypes.name,
          shortName: userStudyTypes.shortName,
        })
        .from(userStudyTypes)
        .where(eq(userStudyTypes.id, studyTypeId))
        .limit(1);
      return {
        timer: buildTimerState(
          inserted[0],
          studyRows[0].name,
          studyRows[0].shortName,
          now,
        ),
        existing: false,
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raceRows = await tx
        .select({
          entry: timingEntries,
          studyName: userStudyTypes.name,
          shortName: userStudyTypes.shortName,
        })
        .from(timingEntries)
        .innerJoin(
          userStudyTypes,
          eq(timingEntries.studyTypeId, userStudyTypes.id),
        )
        .where(
          and(
            eq(timingEntries.userId, userId),
            inArray(timingEntries.status, ["ACTIVE", "PAUSED"]),
          ),
        )
        .limit(1);
      const row = raceRows[0];
      if (!row) throw err;
      return {
        timer: buildTimerState(row.entry, row.studyName, row.shortName, now),
        existing: true,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

/** Idempotent: pausing an already-PAUSED timer is a no-op that returns the
 * current state. Records a `timing_pause_events` row on an actual pause. */
export async function pauseTimer(
  db: DbClient,
  userId: string,
  entryId: string,
  now: Date = new Date(),
): Promise<TimerState> {
  return db.transaction(async (tx) => {
    const { entry, studyName, shortName } = await getOwnedEntryWithStudy(
      tx,
      userId,
      entryId,
    );

    if (entry.status === "PAUSED") {
      return buildTimerState(entry, studyName, shortName, now);
    }
    if (entry.status !== "ACTIVE") {
      throw new ValidationError("Timer is not active");
    }

    const updated = await tx
      .update(timingEntries)
      .set({ status: "PAUSED", pauseStartedAt: now })
      .where(eq(timingEntries.id, entryId))
      .returning();

    await tx.insert(timingPauseEvents).values({
      timingEntryId: entryId,
      pausedAt: now,
    });

    return buildTimerState(updated[0], studyName, shortName, now);
  });
}

/** Idempotent: resuming an already-ACTIVE timer is a no-op that returns the
 * current state. Accumulates the just-ended pause into `paused_duration_ms`
 * and closes the open `timing_pause_events` row. */
export async function resumeTimer(
  db: DbClient,
  userId: string,
  entryId: string,
  now: Date = new Date(),
): Promise<TimerState> {
  return db.transaction(async (tx) => {
    const { entry, studyName, shortName } = await getOwnedEntryWithStudy(
      tx,
      userId,
      entryId,
    );

    if (entry.status === "ACTIVE") {
      return buildTimerState(entry, studyName, shortName, now);
    }
    if (entry.status !== "PAUSED" || entry.pauseStartedAt == null) {
      throw new ValidationError("Timer is not paused");
    }

    const pauseDurationMs = Math.max(
      0,
      now.getTime() - entry.pauseStartedAt.getTime(),
    );
    const newPausedDurationMs = entry.pausedDurationMs + pauseDurationMs;

    const updated = await tx
      .update(timingEntries)
      .set({
        status: "ACTIVE",
        pauseStartedAt: null,
        pausedDurationMs: newPausedDurationMs,
      })
      .where(eq(timingEntries.id, entryId))
      .returning();

    await tx
      .update(timingPauseEvents)
      .set({ resumedAt: now })
      .where(
        and(
          eq(timingPauseEvents.timingEntryId, entryId),
          sql`${timingPauseEvents.resumedAt} IS NULL`,
        ),
      );

    return buildTimerState(updated[0], studyName, shortName, now);
  });
}

/** Deletes an ACTIVE/PAUSED entry outright (the "Discard" action). Never
 * touches COMPLETED entries — use `deleteEntry` for those. */
export async function discardActiveTimer(
  db: DbClient,
  userId: string,
  entryId: string,
): Promise<void> {
  const rows = await db
    .delete(timingEntries)
    .where(
      and(
        eq(timingEntries.id, entryId),
        eq(timingEntries.userId, userId),
        inArray(timingEntries.status, ["ACTIVE", "PAUSED"]),
      ),
    )
    .returning({ id: timingEntries.id });
  if (rows.length === 0) {
    throw new NotFoundError("Active timer not found");
  }
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

/**
 * Completes a timer. Idempotent: finishing an already-COMPLETED entry
 * returns its existing result rather than erroring. Finishing while PAUSED
 * closes the pause at `pause_started_at` — time spent paused, including the
 * open pause, never counts toward `active_duration_ms`.
 */
export async function finishTimer(
  db: DbClient,
  userId: string,
  entryId: string,
  now: Date = new Date(),
): Promise<FinishResult> {
  return db.transaction(async (tx) => {
    const { entry, studyName, shortName } = await getOwnedEntryWithStudy(
      tx,
      userId,
      entryId,
    );

    let finalEntry = entry;

    if (entry.status !== "COMPLETED") {
      if (entry.status !== "ACTIVE" && entry.status !== "PAUSED") {
        throw new ValidationError("Timer cannot be finished from this state");
      }

      const finishedAt =
        entry.status === "PAUSED" && entry.pauseStartedAt
          ? entry.pauseStartedAt
          : now;
      const activeDurationMs = Math.max(
        0,
        finishedAt.getTime() -
          entry.startedAt.getTime() -
          entry.pausedDurationMs,
      );

      const updated = await tx
        .update(timingEntries)
        .set({
          status: "COMPLETED",
          finishedAt,
          activeDurationMs,
          pauseStartedAt: null,
          complexity: "TYPICAL",
        })
        .where(eq(timingEntries.id, entryId))
        .returning();
      finalEntry = updated[0];

      if (entry.status === "PAUSED") {
        await tx
          .update(timingPauseEvents)
          .set({ resumedAt: finishedAt })
          .where(
            and(
              eq(timingPauseEvents.timingEntryId, entryId),
              sql`${timingPauseEvents.resumedAt} IS NULL`,
            ),
          );
      }
    }

    const summary = await buildCompletedSummary(
      tx,
      finalEntry,
      studyName,
      shortName,
    );

    const allCases = await loadUserCases(tx, userId);
    const factors = computeComplexityFactors(allCases);
    const studyCases = allCases.filter(
      (c) => c.studyTypeId === entry.studyTypeId,
    );
    const targetCase: CaseRecord = studyCases.find((c) => c.id === entryId) ?? {
      id: entryId,
      studyTypeId: entry.studyTypeId,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      activeDurationMs: summary.activeDurationMs,
      complexity: summary.complexity,
      excluded: false,
      tagIds: summary.tagIds,
    };

    const feedback = postCaseFeedback(targetCase, studyCases, factors);

    return {
      entry: summary,
      feedback,
      feedbackText: formatFeedbackText(feedback),
      durationText: formatDuration(summary.activeDurationMs),
    };
  });
}

// ---------------------------------------------------------------------------
// Classification (complexity + tags)
// ---------------------------------------------------------------------------

/**
 * Sets complexity and/or the tag set on a COMPLETED, not-yet-finalized
 * entry. Throws `ImmutableError` if the entry is finalized, or if the
 * classification window (10 min after finish) has elapsed — lazily
 * finalizing it first so subsequent reads see it as immutable too.
 */
export async function classifyEntry(
  db: DbClient,
  userId: string,
  entryId: string,
  input: { complexity?: Complexity; tagIds?: string[] },
  now: Date = new Date(),
): Promise<CompletedEntrySummary> {
  // Read + lazy-finalize check happens outside the mutation transaction
  // below: if we're past the window we need the finalize write to persist
  // even though we then throw, so it can't share a transaction that gets
  // rolled back by that throw.
  const initial = await getOwnedEntryWithStudy(db, userId, entryId);

  if (
    initial.entry.status !== "COMPLETED" ||
    initial.entry.finishedAt == null
  ) {
    throw new ImmutableError("Only completed cases can be classified");
  }

  if (initial.entry.classificationFinalizedAt != null) {
    throw new ImmutableError("This case has already been finalized");
  }

  if (isPastClassificationWindow(initial.entry.finishedAt, now)) {
    await db
      .update(timingEntries)
      .set({ classificationFinalizedAt: now })
      .where(eq(timingEntries.id, entryId));
    throw new ImmutableError("The classification window has expired");
  }

  return db.transaction(async (tx) => {
    const { entry, studyName, shortName } = await getOwnedEntryWithStudy(
      tx,
      userId,
      entryId,
    );

    // Re-check inside the transaction in case of a concurrent finalize.
    if (entry.status !== "COMPLETED" || entry.finishedAt == null) {
      throw new ImmutableError("Only completed cases can be classified");
    }
    if (entry.classificationFinalizedAt != null) {
      throw new ImmutableError("This case has already been finalized");
    }
    if (isPastClassificationWindow(entry.finishedAt, now)) {
      throw new ImmutableError("The classification window has expired");
    }

    if (input.tagIds) {
      await assertOwnsTags(tx, userId, input.tagIds);
    }

    if (input.complexity) {
      await tx
        .update(timingEntries)
        .set({ complexity: input.complexity })
        .where(eq(timingEntries.id, entryId));
    }

    if (input.tagIds) {
      await tx
        .delete(timingEntryTags)
        .where(eq(timingEntryTags.timingEntryId, entryId));
      const uniqueTagIds = [...new Set(input.tagIds)];
      if (uniqueTagIds.length > 0) {
        await tx
          .insert(timingEntryTags)
          .values(
            uniqueTagIds.map((tagId) => ({ timingEntryId: entryId, tagId })),
          );
      }
    }

    const refreshed = await tx
      .select()
      .from(timingEntries)
      .where(eq(timingEntries.id, entryId))
      .limit(1);
    return buildCompletedSummary(tx, refreshed[0], studyName, shortName);
  });
}

/** Idempotent: finalizes classification (Done / dismiss / start-another). */
export async function finalizeClassification(
  db: DbClient,
  userId: string,
  entryId: string,
  now: Date = new Date(),
): Promise<CompletedEntrySummary> {
  const { entry, studyName, shortName } = await getOwnedEntryWithStudy(
    db,
    userId,
    entryId,
  );
  if (entry.status !== "COMPLETED") {
    throw new ValidationError("Only completed cases can be finalized");
  }
  if (entry.classificationFinalizedAt == null) {
    const updated = await db
      .update(timingEntries)
      .set({ classificationFinalizedAt: now })
      .where(eq(timingEntries.id, entryId))
      .returning();
    return buildCompletedSummary(db, updated[0], studyName, shortName);
  }
  return buildCompletedSummary(db, entry, studyName, shortName);
}

/** Deletes a COMPLETED entry (History screen "Delete" action). ACTIVE/PAUSED
 * entries must be discarded via `discardActiveTimer` instead. */
export async function deleteEntry(
  db: DbClient,
  userId: string,
  entryId: string,
): Promise<void> {
  const rows = await db
    .delete(timingEntries)
    .where(
      and(
        eq(timingEntries.id, entryId),
        eq(timingEntries.userId, userId),
        eq(timingEntries.status, "COMPLETED"),
      ),
    )
    .returning({ id: timingEntries.id });
  if (rows.length === 0) {
    throw new NotFoundError("Completed case not found");
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface ListHistoryOptions {
  limit?: number;
  offset?: number;
  studyTypeId?: string;
  from?: Date;
  to?: Date;
  complexity?: Complexity;
  /** true = only cases counted toward the benchmark, false = only excluded */
  included?: boolean;
  tagId?: string;
}

export interface HistoryRow {
  id: string;
  studyTypeId: string;
  studyName: string;
  shortName: string;
  finishedAt: Date;
  activeDurationMs: number;
  complexity: Complexity;
  tagIds: string[];
  included: boolean;
}

const DEFAULT_HISTORY_LIMIT = 50;

export async function listHistory(
  db: DbClient,
  userId: string,
  options: ListHistoryOptions = {},
): Promise<HistoryRow[]> {
  const excludedTagSubquery = db
    .select({ one: sql`1` })
    .from(timingEntryTags)
    .innerJoin(tagsTable, eq(timingEntryTags.tagId, tagsTable.id))
    .where(
      and(
        eq(timingEntryTags.timingEntryId, timingEntries.id),
        eq(tagsTable.excludeFromBenchmark, true),
      ),
    );

  const conditions = [
    eq(timingEntries.userId, userId),
    eq(timingEntries.status, "COMPLETED"),
  ];
  if (options.studyTypeId) {
    conditions.push(eq(timingEntries.studyTypeId, options.studyTypeId));
  }
  if (options.from) {
    conditions.push(gte(timingEntries.finishedAt, options.from));
  }
  if (options.to) {
    conditions.push(lte(timingEntries.finishedAt, options.to));
  }
  if (options.complexity) {
    conditions.push(eq(timingEntries.complexity, options.complexity));
  }
  if (options.included === true) {
    conditions.push(notExists(excludedTagSubquery));
  } else if (options.included === false) {
    conditions.push(exists(excludedTagSubquery));
  }
  if (options.tagId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(timingEntryTags)
          .where(
            and(
              eq(timingEntryTags.timingEntryId, timingEntries.id),
              eq(timingEntryTags.tagId, options.tagId),
            ),
          ),
      ),
    );
  }

  const rows = await db
    .select({
      entry: timingEntries,
      studyName: userStudyTypes.name,
      shortName: userStudyTypes.shortName,
    })
    .from(timingEntries)
    .innerJoin(userStudyTypes, eq(timingEntries.studyTypeId, userStudyTypes.id))
    .where(and(...conditions))
    .orderBy(desc(timingEntries.finishedAt))
    .limit(options.limit ?? DEFAULT_HISTORY_LIMIT)
    .offset(options.offset ?? 0);

  if (rows.length === 0) return [];

  const entryIds = rows.map((r) => r.entry.id);
  const tagRows = await db
    .select({
      timingEntryId: timingEntryTags.timingEntryId,
      tagId: timingEntryTags.tagId,
      excludeFromBenchmark: tagsTable.excludeFromBenchmark,
    })
    .from(timingEntryTags)
    .innerJoin(tagsTable, eq(timingEntryTags.tagId, tagsTable.id))
    .where(inArray(timingEntryTags.timingEntryId, entryIds));

  const tagsByEntry = new Map<
    string,
    { tagIds: string[]; excluded: boolean }
  >();
  for (const row of tagRows) {
    let info = tagsByEntry.get(row.timingEntryId);
    if (!info) {
      info = { tagIds: [], excluded: false };
      tagsByEntry.set(row.timingEntryId, info);
    }
    info.tagIds.push(row.tagId);
    if (row.excludeFromBenchmark) info.excluded = true;
  }

  return rows.map((r) => {
    const info = tagsByEntry.get(r.entry.id);
    return {
      id: r.entry.id,
      studyTypeId: r.entry.studyTypeId,
      studyName: r.studyName,
      shortName: r.shortName,
      finishedAt: r.entry.finishedAt as Date,
      activeDurationMs: r.entry.activeDurationMs as number,
      complexity: r.entry.complexity,
      tagIds: info?.tagIds ?? [],
      included: !(info?.excluded ?? false),
    };
  });
}

/** Lazily finalizes any of the user's COMPLETED entries whose classification
 * window has expired but which have not been finalized yet. Intended to be
 * called opportunistically from read paths; `startTimer` already finalizes
 * *every* unfinalized COMPLETED entry unconditionally, which is a superset
 * of this. */
export async function finalizeExpiredClassifications(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - CLASSIFICATION_WINDOW_MS);
  await db
    .update(timingEntries)
    .set({ classificationFinalizedAt: now })
    .where(
      and(
        eq(timingEntries.userId, userId),
        eq(timingEntries.status, "COMPLETED"),
        sql`${timingEntries.classificationFinalizedAt} IS NULL`,
        sql`${timingEntries.finishedAt} < ${cutoff.toISOString()}`,
      ),
    );
}
