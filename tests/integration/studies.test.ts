import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql as rawSql, db } from "@/db";
import * as studiesService from "@/features/studies/service";
import { STUDY_TYPE_TEMPLATES } from "@/features/studies/templates";
import { seedUserDefaults } from "@/features/onboarding/service";
import * as tagsService from "@/features/tags/service";
import * as timerService from "@/features/timer/service";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@/server/errors";
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

describe("onboarding seeding", () => {
  it("copies every template, seeds built-in tags and default preferences, and sets onboardedAt", async () => {
    const userId = await createTestUser();

    await seedUserDefaults(db, userId, { useTemplates: true });

    const studyTypes = await studiesService.listStudyTypes(db, userId);
    expect(studyTypes).toHaveLength(STUDY_TYPE_TEMPLATES.length);
    expect(studyTypes.every((s) => s.createdFromTemplate != null)).toBe(true);

    const tags = await tagsService.listTags(db, userId);
    expect(tags.map((t) => t.name).sort()).toEqual(
      ["Interrupted", "Teaching", "Technical issue"].sort(),
    );
    expect(tags.every((t) => t.builtIn && t.excludeFromBenchmark)).toBe(true);

    const prefs = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(prefs).toHaveLength(1);
    expect(prefs[0].keyboardShortcutsJson).toMatchObject({
      pauseResume: "p",
      finish: "f",
    });
  });

  it("is idempotent: calling it twice does not duplicate study types or tags", async () => {
    const userId = await createTestUser();

    await seedUserDefaults(db, userId, { useTemplates: true });
    await seedUserDefaults(db, userId, { useTemplates: true });

    const studyTypes = await studiesService.listStudyTypes(db, userId);
    expect(studyTypes).toHaveLength(STUDY_TYPE_TEMPLATES.length);

    const tags = await tagsService.listTags(db, userId);
    expect(tags).toHaveLength(3);
  });

  it("useTemplates: false seeds no study types but still seeds tags/preferences", async () => {
    const userId = await createTestUser();

    await seedUserDefaults(db, userId, { useTemplates: false });

    const studyTypes = await studiesService.listStudyTypes(db, userId);
    expect(studyTypes).toHaveLength(0);

    const tags = await tagsService.listTags(db, userId);
    expect(tags).toHaveLength(3);
  });
});

describe("study type CRUD", () => {
  it("creates, updates, favorites, reorders, and deletes a study type", async () => {
    const userId = await createTestUser();

    const created = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head without contrast",
      shortName: "CT Head -C",
    });
    expect(created.favorite).toBe(false);

    const favorited = await studiesService.setFavorite(
      db,
      userId,
      created.id,
      true,
    );
    expect(favorited.favorite).toBe(true);

    const renamed = await studiesService.updateStudyType(
      db,
      userId,
      created.id,
      {
        name: "CT Head without contrast (renamed)",
      },
    );
    expect(renamed.name).toBe("CT Head without contrast (renamed)");

    const second = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head with contrast",
      shortName: "CT Head +C",
    });

    await studiesService.reorderStudyTypes(db, userId, [second.id, created.id]);
    const ordered = await studiesService.listStudyTypes(db, userId);
    expect(ordered.map((s) => s.id)).toEqual([second.id, created.id]);

    const count = await studiesService.countTimings(db, userId, created.id);
    expect(count).toBe(0);

    const { deletedTimingsCount } = await studiesService.deleteStudyType(
      db,
      userId,
      created.id,
    );
    expect(deletedTimingsCount).toBe(0);

    await expect(
      studiesService.updateStudyType(db, userId, created.id, { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("home sections", () => {
  it("orders frequent by all-time completed count and recent by last 3 distinct study types", async () => {
    const userId = await createTestUser();
    await seedUserDefaults(db, userId, { useTemplates: true });

    const studyTypes = await studiesService.listStudyTypes(db, userId);
    const [a, b, c, d] = studyTypes;

    // a: 3 completed, b: 1 completed, c/d: 0 completed.
    const now = new Date("2026-01-01T00:00:00Z");
    async function complete(studyTypeId: string, minutesAgo: number) {
      const startedAt = new Date(now.getTime() - minutesAgo * 60_000);
      const { timer } = await timerService.startTimer(
        db,
        userId,
        studyTypeId,
        startedAt,
      );
      await timerService.finishTimer(
        db,
        userId,
        timer.id,
        new Date(startedAt.getTime() + 1000),
      );
    }

    await complete(a.id, 300);
    await complete(a.id, 200);
    await complete(a.id, 100);
    await complete(b.id, 50);

    const sections = await studiesService.getHomeSections(db, userId);

    expect(sections.frequent[0]?.id).toBe(a.id);
    expect(sections.frequent.some((s) => s.id === c.id)).toBe(false);
    expect(sections.frequent.some((s) => s.id === d.id)).toBe(false);

    // recent: last 3 distinct study types started, most recent first -> b, a
    // (only 2 distinct study types were ever started).
    expect(sections.recent.map((s) => s.id)).toEqual([b.id, a.id]);

    expect(sections.all.length).toBeGreaterThan(0);
    const totalInHierarchy = sections.all.reduce(
      (sum, m) =>
        sum + m.regions.reduce((s2, r) => s2 + r.studyTypes.length, 0),
      0,
    );
    expect(totalInHierarchy).toBe(studyTypes.length);
  });
});

describe("archive instead of cascade delete", () => {
  it("refuses to delete a study type with recorded timings, but archiving preserves its history", async () => {
    const userId = await createTestUser();
    const study = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head without contrast",
      shortName: "CT Head -C",
    });
    await studiesService.setFavorite(db, userId, study.id, true);

    const { timer } = await timerService.startTimer(db, userId, study.id);
    const { entry } = await timerService.finishTimer(db, userId, timer.id);

    await expect(
      studiesService.deleteStudyType(db, userId, study.id),
    ).rejects.toBeInstanceOf(ValidationError);

    const archived = await studiesService.archiveStudyType(
      db,
      userId,
      study.id,
    );
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.favorite).toBe(false);

    // History rows and analytics inputs are untouched by archiving.
    const history = await timerService.listHistory(db, userId, {});
    expect(history.map((h) => h.id)).toContain(entry.id);

    const cases = await (
      await import("@/features/analytics/repository")
    ).loadUserCases(db, userId);
    expect(cases.some((c) => c.id === entry.id)).toBe(true);
  });

  it("archived study types are hidden from getHomeSections and can't be started or favorited", async () => {
    const userId = await createTestUser();
    const study = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head without contrast",
      shortName: "CT Head -C",
    });
    const { timer } = await timerService.startTimer(db, userId, study.id);
    await timerService.finishTimer(db, userId, timer.id);
    await studiesService.archiveStudyType(db, userId, study.id);

    const sections = await studiesService.getHomeSections(db, userId);
    expect(sections.favorites.some((s) => s.id === study.id)).toBe(false);
    expect(sections.frequent.some((s) => s.id === study.id)).toBe(false);
    expect(sections.recent.some((s) => s.id === study.id)).toBe(false);
    const allIds = sections.all.flatMap((m) =>
      m.regions.flatMap((r) => r.studyTypes.map((s) => s.id)),
    );
    expect(allIds).not.toContain(study.id);

    await expect(
      timerService.startTimer(db, userId, study.id),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      studiesService.setFavorite(db, userId, study.id, true),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("unarchiveStudyType restores it to Start", async () => {
    const userId = await createTestUser();
    const study = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head without contrast",
      shortName: "CT Head -C",
    });
    await studiesService.archiveStudyType(db, userId, study.id);
    const restored = await studiesService.unarchiveStudyType(
      db,
      userId,
      study.id,
    );
    expect(restored.archivedAt).toBeNull();

    const sections = await studiesService.getHomeSections(db, userId);
    const allIds = sections.all.flatMap((m) =>
      m.regions.flatMap((r) => r.studyTypes.map((s) => s.id)),
    );
    expect(allIds).toContain(study.id);
  });

  it("deletes a study type with zero timings outright", async () => {
    const userId = await createTestUser();
    const study = await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Head",
      name: "CT Head without contrast",
      shortName: "CT Head -C",
    });
    const { deletedTimingsCount } = await studiesService.deleteStudyType(
      db,
      userId,
      study.id,
    );
    expect(deletedTimingsCount).toBe(0);
    await expect(
      studiesService.updateStudyType(db, userId, study.id, { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("custom modality", () => {
  it("accepts an arbitrary trimmed modality, and the study is startable/favoritable/analyzable", async () => {
    const userId = await createTestUser();
    const study = await studiesService.createStudyType(db, userId, {
      modality: "US",
      bodyRegion: "Abdomen",
      name: "Ultrasound Abdomen",
      shortName: "US Abd",
    });
    expect(study.modality).toBe("US");

    const favorited = await studiesService.setFavorite(
      db,
      userId,
      study.id,
      true,
    );
    expect(favorited.favorite).toBe(true);

    const { timer } = await timerService.startTimer(db, userId, study.id);
    await timerService.finishTimer(db, userId, timer.id);

    const sections = await studiesService.getHomeSections(db, userId);
    expect(sections.favorites.some((s) => s.id === study.id)).toBe(true);
    const usGroup = sections.all.find((m) => m.modality === "US");
    expect(usGroup).toBeDefined();

    const { loadUserCases } = await import("@/features/analytics/repository");
    const cases = await loadUserCases(db, userId);
    expect(cases.some((c) => c.studyTypeId === study.id)).toBe(true);
  });

  it("groups CT and MRI first (in that order), then other modalities alphabetically", async () => {
    const userId = await createTestUser();
    await studiesService.createStudyType(db, userId, {
      modality: "US",
      bodyRegion: "Abdomen",
      name: "US Abdomen",
      shortName: "US Abd",
    });
    await studiesService.createStudyType(db, userId, {
      modality: "MRI",
      bodyRegion: "Pelvis",
      name: "MRI Pelvis",
      shortName: "MRI Pelvis",
    });
    await studiesService.createStudyType(db, userId, {
      modality: "CT",
      bodyRegion: "Chest",
      name: "CT Chest",
      shortName: "CT Chest",
    });
    await studiesService.createStudyType(db, userId, {
      modality: "XR",
      bodyRegion: "Chest",
      name: "XR Chest",
      shortName: "XR Chest",
    });

    const sections = await studiesService.getHomeSections(db, userId);
    expect(sections.all.map((m) => m.modality)).toEqual([
      "CT",
      "MRI",
      "US",
      "XR",
    ]);
  });
});
