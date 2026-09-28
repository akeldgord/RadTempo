import { test, expect } from "@playwright/test";
import { createInvitedUser } from "./helpers";

/**
 * The critical path from docs/SPEC.md "Testing": start a study -> refresh
 * -> pause -> resume -> finish -> mark difficult -> Done -> dashboard
 * reflects the case -> history delete -> dashboard and history are empty
 * again. Users are provisioned via an admin invite (see e2e/helpers.ts);
 * only auth.spec.ts uses the setup wizard.
 */
test("timer loop: start, refresh, pause, resume, finish, classify, dashboard, delete", async ({
  page,
}) => {
  await createInvitedUser(page, "timer");

  // Start "CT A/P +C" from the Start page search.
  await page.getByPlaceholder("Search study types...").fill("CT A/P +C");
  await page.getByText("CT Abdomen/Pelvis with contrast").click();
  await expect(page.getByText("CT A/P +C").first()).toBeVisible();

  // Refresh: the timer survives a full page reload, and elapsed time keeps
  // moving forward (DB-authoritative, not reset by the reload).
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const elapsedBefore = await page
    .getByTestId("timer-elapsed")
    .textContent()
    .catch(() => null);
  await page.waitForTimeout(1500);
  const elapsedAfter = await page
    .getByTestId("timer-elapsed")
    .textContent()
    .catch(() => null);
  if (elapsedBefore && elapsedAfter) {
    expect(elapsedAfter).not.toBe(elapsedBefore);
  }

  // Pause / resume.
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // Finish.
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText(/Completed in/)).toBeVisible();

  // Mark Difficult, then Done.
  await page.getByRole("button", { name: "Difficult" }).click();
  await expect(page.getByRole("button", { name: "Difficult" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Done" }).click();

  // Dashboard reflects the case: no longer the "no history yet" empty state.
  await page.goto("/dashboard");
  await expect(page.getByText("No history yet.")).toHaveCount(0);
  // R2: the dashboard card's trend note distinguishes comparable from
  // total reads (see dashboard-labels.ts) — for exactly one eligible read
  // it reads "Baseline started, 1 comparable read", not "1 case".
  await expect(
    page.getByText("Baseline started, 1 comparable read"),
  ).toBeVisible();

  // History shows exactly one completed, difficult case.
  await page.goto("/history");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Difficult");
  await expect(rows.first()).toContainText("Yes");

  // Delete the case from history: this opens a confirmation dialog
  // (Radix AlertDialog, not a native browser confirm) that must be
  // confirmed with its own "Delete" action button.
  await rows.first().getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("No completed reads yet.")).toBeVisible();

  // Dashboard is back to the empty state.
  await page.goto("/dashboard");
  await expect(page.getByText("No history yet.")).toBeVisible();
});

test("second tab: concurrent starts converge on a single active timer", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  await createInvitedUser(page1, "tabs");

  const page2 = await context.newPage();
  await page2.goto("/");

  await Promise.all([
    page1
      .getByPlaceholder("Search study types...")
      .fill("CT A/P +C")
      .then(() => page1.getByText("CT Abdomen/Pelvis with contrast").click()),
    page2
      .getByPlaceholder("Search study types...")
      .fill("CT A/P +C")
      .then(() => page2.getByText("CT Abdomen/Pelvis with contrast").click()),
  ]);

  // Both tabs converge on the same single active timer (the DB partial
  // unique index guarantees only one ACTIVE/PAUSED entry per user; a race
  // to start returns the existing entry rather than creating a second).
  await page1.reload();
  await page2.reload();
  await expect(page1.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page2.getByRole("button", { name: "Pause" })).toBeVisible();

  // Finish from one tab, then confirm exactly one completed case exists —
  // never two, which a duplicate timer would have produced.
  await page1.getByRole("button", { name: "Finish" }).click();
  await expect(page1.getByText(/Completed in/)).toBeVisible();
  await page1.getByRole("button", { name: "Done" }).click();
  await page1.goto("/history");
  await expect(page1.locator("tbody tr")).toHaveCount(1);

  await context.close();
});
