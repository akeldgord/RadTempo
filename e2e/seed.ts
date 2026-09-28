import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

/**
 * Seeding helper for e2e tests that need history the UI alone can't build
 * quickly (e.g. enough cases to make the learned complexity factors
 * non-identity, see docs/SPEC.md "Analytics"). Talks to the same
 * E2E_DATABASE_URL the app server uses, directly through drizzle/schema —
 * never through the app's HTTP surface. Synthetic data only: no PHI, no
 * real study/case content, just the fields `computeComplexityFactors` and
 * `computeStudyStats` read.
 *
 * Each spec file that imports this should call `closeSeedDb()` once at the
 * end (e.g. in a `test.afterAll`) so its dedicated connection doesn't keep
 * the process alive.
 */

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://radtempo:radtempo@localhost:5432/radtempo_e2e";

let sqlClient: postgres.Sql | null = null;

function getDb() {
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, { max: 1 });
  }
  return drizzle(sqlClient, { schema });
}

/** Closes this module's dedicated DB connection. Call once per spec file
 * that uses seed.ts, after all its tests have run. */
export async function closeSeedDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
  }
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (!rows[0]) throw new Error(`seed.ts: no user with email ${email}`);
  return rows[0].id;
}

/** Finds one of the user's (onboarding-seeded) study types by exact name.
 * Throws if it isn't found — onboarding must have run first. */
export async function getStudyTypeIdByName(
  userId: string,
  name: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.userStudyTypes.id })
    .from(schema.userStudyTypes)
    .where(
      and(
        eq(schema.userStudyTypes.userId, userId),
        eq(schema.userStudyTypes.name, name),
      ),
    );
  if (!rows[0]) {
    throw new Error(`seed.ts: no study type named ${name} for user ${userId}`);
  }
  return rows[0].id;
}

export type SeedComplexity = "EASY" | "TYPICAL" | "DIFFICULT";

export interface SeedCaseInput {
  complexity: SeedComplexity;
  /** Raw active duration in ms (the "read"'s pace, pre complexity-factor
   * adjustment). */
  durationMs: number;
  /** When the case finished. Cases should be inserted in ascending
   * `finishedAt` order to control which land in the "recent" window. */
  finishedAt: Date;
}

/**
 * Inserts a batch of already-COMPLETED, included (no tags) timing_entries
 * for one study, directly — the fast way to build the history needed for
 * deterministic learned complexity factors (see
 * src/features/analytics/engine.ts computeComplexityFactors and
 * engine.test.ts's `buildFactorHistory` fixture, which this mirrors).
 */
export async function seedCompletedCases(
  userId: string,
  studyTypeId: string,
  cases: SeedCaseInput[],
): Promise<void> {
  const db = getDb();
  if (cases.length === 0) return;
  await db.insert(schema.timingEntries).values(
    cases.map((c) => ({
      userId,
      studyTypeId,
      status: "COMPLETED" as const,
      startedAt: new Date(c.finishedAt.getTime() - c.durationMs),
      pausedDurationMs: 0,
      finishedAt: c.finishedAt,
      activeDurationMs: c.durationMs,
      complexity: c.complexity,
      classificationFinalizedAt: c.finishedAt,
    })),
  );
}

/** Inserts a single already-COMPLETED, excluded-from-benchmark case: an
 * "Interrupted"-tagged read, for R2's "reads that don't count" fixtures.
 * `tagName` must be one of the user's built-in tags (seeded at
 * onboarding) with exclude_from_benchmark = true. */
export async function seedExcludedCase(
  userId: string,
  studyTypeId: string,
  input: SeedCaseInput,
  tagName = "Interrupted",
): Promise<void> {
  const db = getDb();
  const tagRows = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(and(eq(schema.tags.userId, userId), eq(schema.tags.name, tagName)));
  const tag = tagRows[0];
  if (!tag) {
    throw new Error(`seed.ts: no tag named ${tagName} for user ${userId}`);
  }

  const [entry] = await db
    .insert(schema.timingEntries)
    .values({
      userId,
      studyTypeId,
      status: "COMPLETED" as const,
      startedAt: new Date(input.finishedAt.getTime() - input.durationMs),
      pausedDurationMs: 0,
      finishedAt: input.finishedAt,
      activeDurationMs: input.durationMs,
      complexity: input.complexity,
      classificationFinalizedAt: input.finishedAt,
    })
    .returning({ id: schema.timingEntries.id });

  await db.insert(schema.timingEntryTags).values({
    timingEntryId: entry.id,
    tagId: tag.id,
  });
}

/**
 * Backdates the user's single currently-ACTIVE/PAUSED timer's `started_at`
 * so that, when Finish is clicked "now" in the browser, the resulting
 * activeDurationMs comes out to (approximately) `durationMs`. Used instead
 * of waiting in real time for a 15-minute read (see docs/SPEC.md
 * "Testing" and R3 audit item). `pausedDurationMs` defaults to 0 (the
 * timer must not have been paused in this test before calling this).
 */
export async function backdateActiveTimerStart(
  userId: string,
  durationMs: number,
): Promise<void> {
  const db = getDb();
  const startedAt = new Date(Date.now() - durationMs);
  const rows = await db
    .update(schema.timingEntries)
    .set({ startedAt, pausedDurationMs: 0 })
    .where(
      and(
        eq(schema.timingEntries.userId, userId),
        eq(schema.timingEntries.status, "ACTIVE"),
      ),
    )
    .returning({ id: schema.timingEntries.id });
  if (rows.length === 0) {
    throw new Error(`seed.ts: no ACTIVE timer to backdate for user ${userId}`);
  }
}
