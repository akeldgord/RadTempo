import { test, expect } from "@playwright/test";

/**
 * Smoke test for the foundation auth flow. The full timer loop e2e test
 * (login -> start -> pause -> resume -> finish -> dashboard) lands in
 * Phase 2 once the Start screen and timer exist.
 */
test("unauthenticated visitors are redirected to /login or /setup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(login|setup)/);
});
