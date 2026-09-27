import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql as rawSql, db } from "@/db";
import * as studiesService from "@/features/studies/service";
import * as tagsService from "@/features/tags/service";
import * as timerService from "@/features/timer/service";
import { NotFoundError } from "@/server/errors";
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

describe("cross-user authorization", () => {
  it("user B cannot read, update, favorite, reorder, or delete user A's study types", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");

    const studyA = await studiesService.createStudyType(db, userA, {
      modality: "CT",
      bodyRegion: "Chest",
      name: "CT Chest -C",
      shortName: "CT Chest -C",
    });

    await expect(
      studiesService.updateStudyType(db, userB, studyA.id, {
        name: "hijacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      studiesService.setFavorite(db, userB, studyA.id, true),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      studiesService.deleteStudyType(db, userB, studyA.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      studiesService.countTimings(db, userB, studyA.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    // B's own list never includes A's study type.
    const bList = await studiesService.listStudyTypes(db, userB);
    expect(bList).toHaveLength(0);

    // A's study type is untouched.
    const aList = await studiesService.listStudyTypes(db, userA);
    expect(aList).toHaveLength(1);
  });

  it("user B cannot read, pause, resume, finish, classify, or delete user A's timing entries", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");

    const studyA = await studiesService.createStudyType(db, userA, {
      modality: "CT",
      bodyRegion: "Chest",
      name: "CT Chest -C",
      shortName: "CT Chest -C",
    });

    const { timer } = await timerService.startTimer(db, userA, studyA.id);

    await expect(
      timerService.pauseTimer(db, userB, timer.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      timerService.resumeTimer(db, userB, timer.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      timerService.discardActiveTimer(db, userB, timer.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      timerService.finishTimer(db, userB, timer.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    // B has no active timer of their own, and A's is untouched (still ACTIVE).
    const bActive = await timerService.getActiveTimer(db, userB);
    expect(bActive).toBeNull();
    const aActive = await timerService.getActiveTimer(db, userA);
    expect(aActive?.id).toBe(timer.id);
    expect(aActive?.status).toBe("ACTIVE");

    const { entry } = await timerService.finishTimer(db, userA, timer.id);

    await expect(
      timerService.classifyEntry(db, userB, entry.id, { complexity: "EASY" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      timerService.finalizeClassification(db, userB, entry.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      timerService.deleteEntry(db, userB, entry.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    // B's history never lists A's case.
    const bHistory = await timerService.listHistory(db, userB, {});
    expect(bHistory).toHaveLength(0);
    const aHistory = await timerService.listHistory(db, userA, {});
    expect(aHistory).toHaveLength(1);
  });

  it("user B cannot read, edit, or delete user A's tags, and cannot classify with B's tags on A's entry", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");

    const tagA = await tagsService.createTag(db, userA, { name: "Custom A" });
    const tagB = await tagsService.createTag(db, userB, { name: "Custom B" });

    await expect(
      tagsService.updateTag(db, userB, tagA.id, { name: "hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      tagsService.deleteTag(db, userB, tagA.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const bTags = await tagsService.listTags(db, userB);
    expect(bTags.map((t) => t.id)).toEqual([tagB.id]);

    const studyA = await studiesService.createStudyType(db, userA, {
      modality: "CT",
      bodyRegion: "Chest",
      name: "CT Chest -C",
      shortName: "CT Chest -C",
    });
    const { timer } = await timerService.startTimer(db, userA, studyA.id);
    const { entry } = await timerService.finishTimer(db, userA, timer.id);

    // A cannot classify their own entry using B's tag id.
    await expect(
      timerService.classifyEntry(db, userA, entry.id, { tagIds: [tagB.id] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("starting a timer on another user's study type is rejected", async () => {
    const userA = await createTestUser("a@example.com");
    const userB = await createTestUser("b@example.com");

    const studyA = await studiesService.createStudyType(db, userA, {
      modality: "CT",
      bodyRegion: "Chest",
      name: "CT Chest -C",
      shortName: "CT Chest -C",
    });

    await expect(
      timerService.startTimer(db, userB, studyA.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
