import { test, expect } from "@playwright/test";

/**
 * The critical path from docs/SPEC.md "Testing": setup -> onboarding ->
 * start a study -> refresh -> pause -> resume -> finish -> mark difficult
 * -> history shows the case. The dashboard-reflects step is a TODO until
 * Phase 3 adds the dashboard.
 */
test("timer loop: start, refresh, pause, resume, finish, classify, history", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "supersecret123";

  // Setup wizard creates the first admin.
  await page.goto("/setup");
  await page.locator("#name").fill("E2E Admin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/);

  // Log in.
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/onboarding/);

  // Onboarding: accept defaults through all four steps.
  await page.getByText("Continue").click();
  await page.getByText("Continue").click();
  await page.getByText("Continue").click();
  await page.getByText("Start using RadTempo").click();
  await page.waitForURL("/");

  // Start "CT A/P +C" from the Start page search.
  await page.getByPlaceholder("Search study types...").fill("CT A/P +C");
  await page.getByText("CT Abdomen/Pelvis with contrast").click();
  await expect(page.getByText("CT A/P +C").first()).toBeVisible();

  // Refresh: the timer survives a full page reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

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

  // History shows exactly one completed, difficult case.
  await page.goto("/history");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Difficult");
  await expect(rows.first()).toContainText("Yes");

  // TODO(Phase 3): assert the dashboard reflects this case once it exists.
});
