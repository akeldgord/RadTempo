import { test, expect, type Page } from "@playwright/test";
import { ADMIN_EMAIL, openAdminPage } from "./helpers";
import {
  backdateActiveTimerStart,
  closeSeedDb,
  getStudyTypeIdByName,
  getUserIdByEmail,
  seedCompletedCases,
  seedExcludedCase,
  type SeedCaseInput,
} from "./seed";

/**
 * R3 audit item coverage: the R1 post-case comparison graphic, R2's
 * dashboard trend-note copy, and a 375px mobile journey. All three run as
 * the already-authenticated admin (via `openAdminPage`, the cached
 * session auth.spec.ts leaves behind) rather than a fresh invited user —
 * Better Auth's /sign-in and /sign-up rate limits (5/60s/IP, see
 * src/lib/auth.ts) are already spent right up to their budget by the rest
 * of the suite (auth.spec.ts + timer-flow.spec.ts + the deliberate flood
 * in zz-rate-limit.spec.ts), so even one more sign-up/sign-in pair here
 * reliably tips later specs into 429s. None of the three concerns below
 * actually need an isolated account — they use distinct study types
 * (already present on the admin from its own onboarding defaults), so
 * running them on the admin costs no extra rate-limit budget at all.
 */
test.describe
  .serial("R3: post-case graphic, dashboard copy, mobile journey", () => {
  let page: Page;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    page = await openAdminPage(browser);
    userId = await getUserIdByEmail(ADMIN_EMAIL);
  });

  test.afterAll(async () => {
    await page.close();
    await closeSeedDb();
  });

  const DAY_MS = 86_400_000;

  /**
   * The exact fixture from engine.test.ts's `buildFactorHistory` /
   * "postCaseFeedback adjustedDurationMs (R1)": a single study with 5 EASY
   * @ 5:00, 10 TYPICAL @ 10:00, 5 DIFFICULT @ 20:00, chronologically
   * ordered EASY -> TYPICAL -> DIFFICULT. The study median duration falls
   * inside the TYPICAL block, so the learned ratios are exact: EASY
   * factor = 0.5, TYPICAL = 1, DIFFICULT = 2 — and every prior case's
   * *adjusted* duration is exactly 600_000ms (10:00), so the recent
   * comparable pace the browser will show is unambiguous.
   */
  function buildFactorHistory(base: Date): SeedCaseInput[] {
    const cases: SeedCaseInput[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push({
        complexity: "EASY",
        durationMs: 300_000,
        finishedAt: new Date(base.getTime() + i * DAY_MS),
      });
    }
    for (let i = 0; i < 10; i++) {
      cases.push({
        complexity: "TYPICAL",
        durationMs: 600_000,
        finishedAt: new Date(base.getTime() + (5 + i) * DAY_MS),
      });
    }
    for (let i = 0; i < 5; i++) {
      cases.push({
        complexity: "DIFFICULT",
        durationMs: 1_200_000,
        finishedAt: new Date(base.getTime() + (15 + i) * DAY_MS),
      });
    }
    return cases;
  }

  test("post-case graphic: learned complexity factors drive the comparison and the plotted 'this read' value (R1)", async () => {
    const studyTypeId = await getStudyTypeIdByName(
      userId,
      "CT Abdomen/Pelvis with contrast",
    );
    const base = new Date(Date.now() - 40 * DAY_MS);
    await seedCompletedCases(userId, studyTypeId, buildFactorHistory(base));

    // --- Case A: raw 15:00, classified Difficult -> adjusted 07:30, 25%
    // faster than the 10:00 recent comparable pace. ---
    await page.goto("/");
    await page.getByPlaceholder("Search study types...").fill("CT A/P +C");
    await page.getByText("CT Abdomen/Pelvis with contrast").click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    await backdateActiveTimerStart(userId, 15 * 60 * 1000);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText(/Completed in 15:00/)).toBeVisible();

    await page.getByRole("button", { name: "Difficult" }).click();
    await expect(
      page.getByText("25% faster than your recent comparable pace"),
    ).toBeVisible();

    // The graphic's plotted "this read" value: the SVG's accessible name
    // carries the actual adjusted duration ("07:30"); the raw duration
    // text above it stays "Completed in 15:00" — the two must never be
    // conflated.
    const caliperA = page.getByRole("img", { name: /this read/i });
    await expect(caliperA).toHaveAccessibleName(/07:30/);
    await expect(page.getByText(/Completed in 15:00/)).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();

    // --- Case B: raw 06:00, classified Easy -> adjusted 12:00, 20% above
    // the (still 10:00) recent comparable pace. ---
    await page.getByPlaceholder("Search study types...").fill("CT A/P +C");
    await page.getByText("CT Abdomen/Pelvis with contrast").click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    await backdateActiveTimerStart(userId, 6 * 60 * 1000);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText(/Completed in 06:00/)).toBeVisible();

    await page.getByRole("button", { name: "Easy" }).click();
    await expect(
      page.getByText("20% above your recent comparable pace"),
    ).toBeVisible();

    const caliperB = page.getByRole("img", { name: /this read/i });
    await expect(caliperB).toHaveAccessibleName(/12:00/);
    await expect(page.getByText(/Completed in 06:00/)).toBeVisible();

    // Adding an exclude-from-benchmark tag ("Interrupted") to this same
    // case removes the comparison text and the graphic entirely — an
    // excluded case gets no benchmark comparison (see
    // computeFeedbackForEntry).
    await page.getByRole("button", { name: "Interrupted" }).click();
    await expect(
      page.getByText("Not included in your personal benchmark"),
    ).toBeVisible();
    await expect(
      page.getByText("20% above your recent comparable pace"),
    ).toHaveCount(0);
    await expect(page.getByRole("img", { name: /this read/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Done" }).click();
  });

  test("dashboard trend-note copy distinguishes comparable from excluded reads (R2)", async () => {
    const studyTypeId = await getStudyTypeIdByName(
      userId,
      "CT Chest without contrast",
    );
    const base = new Date(Date.now() - 10 * DAY_MS);

    // One excluded read.
    await seedExcludedCase(userId, studyTypeId, {
      complexity: "TYPICAL",
      durationMs: 600_000,
      finishedAt: base,
    });
    await page.goto("/dashboard");
    await expect(
      page.getByText(
        "No comparable reads yet — completed reads are excluded from the benchmark",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Baseline started/)).toHaveCount(0);
    await expect(page.getByText(/baseline forming/)).toHaveCount(0);
    await expect(page.getByText(/^\d+%/)).toHaveCount(0);

    // Several more excluded reads: still no comparable copy, still never
    // a baseline/percentage claim, no matter how many total reads exist.
    for (let i = 1; i <= 4; i++) {
      await seedExcludedCase(userId, studyTypeId, {
        complexity: "TYPICAL",
        durationMs: 600_000,
        finishedAt: new Date(base.getTime() + i * DAY_MS),
      });
    }
    await page.reload();
    await expect(
      page.getByText(
        "No comparable reads yet — completed reads are excluded from the benchmark",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Baseline started/)).toHaveCount(0);
    await expect(page.getByText(/baseline forming/)).toHaveCount(0);
    await expect(page.getByText(/^\d+%/)).toHaveCount(0);

    // One eligible (non-excluded) read: now the singular baseline-started
    // copy appears, with the exact eligible count.
    await seedCompletedCases(userId, studyTypeId, [
      {
        complexity: "TYPICAL",
        durationMs: 600_000,
        finishedAt: new Date(base.getTime() + 5 * DAY_MS),
      },
    ]);
    await page.reload();
    await expect(
      page.getByText("Baseline started, 1 comparable read"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "No comparable reads yet — completed reads are excluded from the benchmark",
      ),
    ).toHaveCount(0);
  });

  test("history delete dialog: Escape returns focus to the Delete button that opened it", async () => {
    // A dialog whose `open` state is driven externally (here, by more
    // than one row's Delete button) doesn't get Radix's automatic
    // focus-return for free — see src/hooks/use-dialog-focus-return.ts
    // and DESIGN_NOTES.md "R3 verification".
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/history");
    const deleteBtn = page
      .locator('button[aria-label^="Delete case from"]')
      .first();
    await deleteBtn.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(deleteBtn).toBeFocused();
  });

  test("mobile (375px): start, pause, resume, finish, classify, delete from the visible mobile History list", async () => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/");
    await page.getByPlaceholder("Search study types...").fill("CTA Chest");
    // The result item renders both the study's name and short name, each
    // its own text node inside one clickable row — `getByText` resolves
    // both, so scope to the first (either click starts the same study).
    await page.getByText("CTA Chest", { exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText(/Completed in/)).toBeVisible();
    await page.getByRole("button", { name: "Difficult" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto("/history");

    // The desktop table is `hidden` at this width; the mobile stacked list
    // (`sm:hidden`, so visible below the sm breakpoint) is what the user
    // actually sees, and is what this test scopes its selectors to.
    const desktopTable = page.locator('div[class*="sm:block"] table');
    const mobileList = page.locator('ul[class*="sm:hidden"]');
    await expect(desktopTable).toBeHidden();
    await expect(mobileList).toBeVisible();

    const row = mobileList
      .getByRole("listitem")
      .filter({ hasText: "CTA Chest" })
      .first();
    await expect(row).toContainText("Difficult");

    await row.getByRole("button", { name: /Delete case from/ }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(row).toHaveCount(0);
  });
});
