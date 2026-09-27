import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { sql as rawSql, db } from "@/db";
import {
  achievementEvents,
  session as sessionTable,
  tags as tagsTable,
  timingEntries,
  timingEntryTags,
  timingPauseEvents,
  user as userTable,
  userPreferences,
  userStudyTypes,
} from "@/db/schema";
import * as studiesService from "@/features/studies/service";
import * as tagsService from "@/features/tags/service";
import {
  buildExportBundle,
  buildUserExport,
} from "@/features/import-export/export";
import {
  applyImport,
  parseImport,
  previewImport,
} from "@/features/import-export/import";
import { deleteOwnAccount, LastAdminError } from "@/features/account/service";
import { ValidationError } from "@/server/errors";
import { loadUserCases } from "@/features/analytics/repository";
import {
  computeComplexityFactors,
  computeStudyStats,
} from "@/features/analytics/engine";
import type { Complexity } from "@/features/analytics/types";
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

async function insertCompletedCase(
  userId: string,
  studyTypeId: string,
  opts: {
    finishedAt: Date;
    durationMs: number;
    complexity?: Complexity;
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
  return rows[0];
}

/** Populates a user with a study type, a custom tag, and a handful of
 * completed cases spread across time so analytics has something to say. */
async function seedRichUser(userId: string) {
  const study = await makeStudyType(userId);
  const tag = await tagsService.createTag(db, userId, {
    name: "Teaching case",
    excludeFromBenchmark: false,
  });

  const base = new Date("2026-01-01T12:00:00Z");
  const complexities: Complexity[] = [
    "TYPICAL",
    "EASY",
    "DIFFICULT",
    "TYPICAL",
    "TYPICAL",
    "EASY",
  ];
  for (let i = 0; i < complexities.length; i++) {
    const finishedAt = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    const entry = await insertCompletedCase(userId, study.id, {
      finishedAt,
      durationMs: 600_000 + i * 15_000,
      complexity: complexities[i],
    });
    if (i === 0) {
      await db
        .insert(timingEntryTags)
        .values({ timingEntryId: entry.id, tagId: tag.id });
    }
  }
  return { study, tag };
}

async function exportBufferFor(userId: string): Promise<Buffer> {
  return buildUserExport(db, userId);
}

async function statsByStudyName(userId: string) {
  const cases = await loadUserCases(db, userId);
  const factors = computeComplexityFactors(cases);
  const studyRows = await db
    .select({ id: userStudyTypes.id, name: userStudyTypes.name })
    .from(userStudyTypes)
    .where(eq(userStudyTypes.userId, userId));
  const nameById = new Map(studyRows.map((r) => [r.id, r.name]));

  const byStudy = new Map<string, typeof cases>();
  for (const c of cases) {
    const list = byStudy.get(c.studyTypeId) ?? [];
    list.push(c);
    byStudy.set(c.studyTypeId, list);
  }

  const result: Record<string, ReturnType<typeof computeStudyStats>> = {};
  for (const [studyTypeId, studyCases] of byStudy) {
    const name = nameById.get(studyTypeId)!;
    result[name] = computeStudyStats(studyCases, factors);
  }
  return result;
}

describe("export / import round trip", () => {
  it("re-importing into a fresh account reproduces identical analytics", async () => {
    const userA = await createTestUser("a@example.com");
    await seedRichUser(userA);

    const buffer = await exportBufferFor(userA);
    const parsed = parseImport(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const userB = await createTestUser("b@example.com");
    const applied = await applyImport(db, userB, parsed.bundle, {
      applyPreferences: false,
    });
    expect(applied.cases.created).toBe(6);
    expect(applied.cases.skipped).toBe(0);

    const statsA = await statsByStudyName(userA);
    const statsB = await statsByStudyName(userB);
    expect(statsB).toEqual(statsA);
  });

  it("does not duplicate timings on a repeated import into the same account", async () => {
    const userA = await createTestUser("a@example.com");
    await seedRichUser(userA);
    const buffer = await exportBufferFor(userA);

    const userB = await createTestUser("b@example.com");
    const parsed1 = parseImport(buffer);
    expect(parsed1.ok).toBe(true);
    if (!parsed1.ok) return;
    const first = await applyImport(db, userB, parsed1.bundle, {
      applyPreferences: false,
    });
    expect(first.cases.created).toBe(6);

    const parsed2 = parseImport(buffer);
    expect(parsed2.ok).toBe(true);
    if (!parsed2.ok) return;
    const second = await applyImport(db, userB, parsed2.bundle, {
      applyPreferences: false,
    });
    expect(second.cases.created).toBe(0);
    expect(second.cases.skipped).toBe(6);

    const cases = await loadUserCases(db, userB);
    expect(cases).toHaveLength(6);
  });

  it("importing into a different account while the original owner's ids are still in use remaps them, and a repeat import dedupes", async () => {
    const userA = await createTestUser("a@example.com");
    await seedRichUser(userA);
    const buffer = await exportBufferFor(userA);

    // userA still owns the original timing ids in this export.
    const userB = await createTestUser("b@example.com");

    const parsed1 = parseImport(buffer);
    expect(parsed1.ok).toBe(true);
    if (!parsed1.ok) return;
    const preview = await previewImport(db, userB, parsed1.bundle);
    expect(preview.cases.new).toBe(6);
    expect(preview.cases.duplicate).toBe(0);

    const first = await applyImport(db, userB, parsed1.bundle, {
      applyPreferences: false,
    });
    expect(first.cases.created).toBe(6);

    // The ids actually used for userB's rows must differ from userA's
    // (the collision was avoided by remapping), and userA's own cases are
    // untouched.
    const originalIds = new Set(parsed1.bundle.timings.map((t) => t.id));
    const bEntries = await db
      .select({ id: timingEntries.id })
      .from(timingEntries)
      .where(eq(timingEntries.userId, userB));
    for (const row of bEntries) {
      expect(originalIds.has(row.id)).toBe(false);
    }
    const aCases = await loadUserCases(db, userA);
    expect(aCases).toHaveLength(6);

    // Re-importing the same export into userB again dedupes via the same
    // deterministic remap.
    const parsed2 = parseImport(buffer);
    expect(parsed2.ok).toBe(true);
    if (!parsed2.ok) return;
    const second = await applyImport(db, userB, parsed2.bundle, {
      applyPreferences: false,
    });
    expect(second.cases.created).toBe(0);
    expect(second.cases.skipped).toBe(6);

    const bCases = await loadUserCases(db, userB);
    expect(bCases).toHaveLength(6);
  });

  it("rejects a malformed or tampered bundle", async () => {
    const userA = await createTestUser("a@example.com");
    await seedRichUser(userA);
    const buffer = await exportBufferFor(userA);

    const unzipped = unzipSync(buffer);
    const manifest = JSON.parse(strFromU8(unzipped["manifest.json"]));
    manifest.export_schema_version = 999;
    unzipped["manifest.json"] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );

    const tampered = Buffer.from(zipSync(unzipped));

    const parsed = parseImport(tampered);
    expect(parsed.ok).toBe(false);

    const garbage = parseImport(Buffer.from("not a zip file at all"));
    expect(garbage.ok).toBe(false);
  });

  it("never includes password hashes or session tokens", async () => {
    const userA = await createTestUser("a@example.com");
    await seedRichUser(userA);
    const buffer = await exportBufferFor(userA);
    const unzipped = unzipSync(buffer);

    for (const [name, bytes] of Object.entries(unzipped)) {
      const text = strFromU8(bytes);
      expect(text.toLowerCase()).not.toMatch(/password/);
      if (name !== "timings.csv") {
        expect(text.toLowerCase()).not.toMatch(/\btoken\b/);
      }
    }
  });

  it("only ever exports the calling user's own data", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");
    await seedRichUser(userA);
    await makeStudyType(userB, "MRI Brain -C");

    const bundleB = await buildExportBundle(db, userB);
    expect(bundleB.studyTypes.map((s) => s.name)).toEqual(["MRI Brain -C"]);
    expect(bundleB.timings).toHaveLength(0);
    expect(bundleB.profile.email).toBe("b@example.com");
  });
});

describe("account deletion", () => {
  async function tableCounts(userId: string) {
    const [sessions, prefs, studyTypes, timings, tags, achievements] =
      await Promise.all([
        db.select().from(sessionTable).where(eq(sessionTable.userId, userId)),
        db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId)),
        db
          .select()
          .from(userStudyTypes)
          .where(eq(userStudyTypes.userId, userId)),
        db.select().from(timingEntries).where(eq(timingEntries.userId, userId)),
        db.select().from(tagsTable).where(eq(tagsTable.userId, userId)),
        db
          .select()
          .from(achievementEvents)
          .where(eq(achievementEvents.userId, userId)),
      ]);
    return {
      sessions: sessions.length,
      prefs: prefs.length,
      studyTypes: studyTypes.length,
      timings: timings.length,
      tags: tags.length,
      achievements: achievements.length,
    };
  }

  it("cascades every row owned by the deleted user, including pause events and sessions", async () => {
    const userId = await createTestUser("delete-me@example.com");
    const study = await makeStudyType(userId);
    const entry = await insertCompletedCase(userId, study.id, {
      finishedAt: new Date("2026-01-01T12:00:00Z"),
      durationMs: 600_000,
    });
    await db.insert(timingPauseEvents).values({
      timingEntryId: entry.id,
      pausedAt: new Date("2026-01-01T11:50:00Z"),
      resumedAt: new Date("2026-01-01T11:55:00Z"),
    });
    await db.insert(sessionTable).values({
      userId,
      token: `token-${userId}`,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const before = await tableCounts(userId);
    expect(before.sessions).toBeGreaterThan(0);
    expect(before.timings).toBeGreaterThan(0);

    await deleteOwnAccount(db, userId, {
      confirmEmail: "delete-me@example.com",
    });

    const after = await tableCounts(userId);
    expect(after).toEqual({
      sessions: 0,
      prefs: 0,
      studyTypes: 0,
      timings: 0,
      tags: 0,
      achievements: 0,
    });

    const pauseEvents = await db
      .select()
      .from(timingPauseEvents)
      .where(eq(timingPauseEvents.timingEntryId, entry.id));
    expect(pauseEvents).toHaveLength(0);

    const userRows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId));
    expect(userRows).toHaveLength(0);
  });

  it("refuses a mismatched confirmation email", async () => {
    const userId = await createTestUser("confirm-me@example.com");
    await expect(
      deleteOwnAccount(db, userId, { confirmEmail: "wrong@example.com" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const userRows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, userId));
    expect(userRows).toHaveLength(1);
  });

  it("refuses to delete the last remaining active admin", async () => {
    const adminId = await createTestUser("only-admin@example.com");
    await db
      .update(userTable)
      .set({ role: "ADMIN" })
      .where(eq(userTable.id, adminId));

    await expect(
      deleteOwnAccount(db, adminId, { confirmEmail: "only-admin@example.com" }),
    ).rejects.toBeInstanceOf(LastAdminError);

    const userRows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, adminId));
    expect(userRows).toHaveLength(1);

    // With a second active admin present, deletion is allowed.
    const secondAdminId = await createTestUser("second-admin@example.com");
    await db
      .update(userTable)
      .set({ role: "ADMIN" })
      .where(eq(userTable.id, secondAdminId));

    await deleteOwnAccount(db, adminId, {
      confirmEmail: "only-admin@example.com",
    });
    const afterRows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, adminId));
    expect(afterRows).toHaveLength(0);
  });
});
