import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  bootstrapAdmin,
  cacheAdminSession,
  completeOnboarding,
  login,
} from "./helpers";

/**
 * Auth/registration policy coverage from docs/SPEC.md "Auth & accounts":
 * invite_only is the default, registration without a valid invite is
 * rejected, and an admin-created invite unblocks registration.
 *
 * This file's second test bootstraps the instance's one and only admin
 * (via the setup wizard, which only ever works for the first user) — every
 * other spec in the run gets its users through that admin's invites (see
 * e2e/helpers.ts).
 */

test("unauthenticated visitors are redirected to /login or /setup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(login|setup)/);
});

test("invite-only default: register without an invite is rejected, then an admin invite unblocks it", async ({
  page,
}) => {
  await bootstrapAdmin(page);

  // Registering without an invite must be rejected (default registration
  // mode is invite_only).
  const uninvitedEmail = `e2e-uninvited-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.locator("#name").fill("No Invite");
  await page.locator("#email").fill(uninvitedEmail);
  await page.locator("#password").fill("supersecret123");
  await page.click('button[type="submit"]');
  await expect(
    page.getByRole("alert").filter({ hasText: /invite/i }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/register/);

  // Log in as the admin and create an invite. Cache the resulting session
  // so other specs' createInvitedUser() (see e2e/helpers.ts) don't each
  // spend one of the admin's own limited sign-in attempts.
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await completeOnboarding(page);
  await cacheAdminSession(page);

  await page.goto("/admin");
  await page.getByRole("button", { name: "Create invite" }).click();
  // Scope to the invite link's own <code>, not one of the several other
  // <code> tags on the admin page (e.g. the telemetry field list), and
  // wait for the server action to actually resolve.
  const inviteCode = page
    .locator("code")
    .filter({ hasText: /register\?invite=/ });
  await expect(inviteCode).toBeVisible();
  const inviteLink = await inviteCode.textContent();
  expect(inviteLink).toBeTruthy();
  const url = new URL(inviteLink!);
  const inviteToken = url.searchParams.get("invite");
  expect(inviteToken).toBeTruthy();

  // Sign out, then register with the invite token: this must succeed.
  await page.context().clearCookies();
  const invitedEmail = `e2e-invited-${Date.now()}@example.com`;
  await page.goto(`/register?invite=${inviteToken}`);
  await page.locator("#name").fill("Invited User");
  await page.locator("#email").fill(invitedEmail);
  await page.locator("#password").fill("supersecret123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/);

  await login(page, invitedEmail, "supersecret123");
  await page.waitForURL(/\/onboarding/);
});
