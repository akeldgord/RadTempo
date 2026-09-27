import type { Browser, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The e2e database is reset once per `pnpm e2e` run (see e2e/reset-db.ts),
 * and RadTempo's setup wizard only ever creates the *first* user on an
 * instance. So exactly one spec across the whole run may call `/setup`;
 * every other test that needs a user account gets one through an admin
 * invite instead, using this fixed admin.
 *
 * Better Auth's sign-in rate limit (5 per 60s, SPEC "Security baseline")
 * applies per IP across the whole suite, so admin sessions are cached to
 * disk as Playwright storage state rather than re-logging in as the admin
 * for every invite — the only sign-in each spec should need is its own
 * new user's.
 */
export const ADMIN_EMAIL = "e2e-admin@example.com";
export const ADMIN_PASSWORD = "supersecret123";
// Must match the SETUP_TOKEN the web server was started with (see
// playwright.config.ts's webServer.env and .github/workflows/e2e.yml).
export const SETUP_TOKEN =
  process.env.SETUP_TOKEN ?? "e2e-setup-token-not-for-production-use-only";

const ADMIN_STATE_PATH = path.join(__dirname, ".auth", "admin.json");

/**
 * Opens a page already authenticated as the admin, from the cached
 * storage state auth.spec.ts leaves behind — no `/sign-in/email` request
 * at all, so it costs none of the shared rate-limit budget. Use this
 * (rather than `createInvitedUser`) for a spec that doesn't need its own
 * isolated account and would otherwise just spend another sign-up/sign-in
 * pair for no reason (e.g. exercising a UI flow against arbitrary study
 * types, as R3's e2e/r3.spec.ts does). Requires auth.spec.ts to already
 * have run in this suite (it's the one that populates the cache).
 */
export async function openAdminPage(browser: Browser): Promise<Page> {
  if (!existsSync(ADMIN_STATE_PATH)) {
    throw new Error(
      "openAdminPage: no cached admin session found — auth.spec.ts must run first in the suite",
    );
  }
  const context = await browser.newContext({ storageState: ADMIN_STATE_PATH });
  return context.newPage();
}

/** Creates the instance's one and only admin via the setup wizard. Call
 * this from exactly one test in the whole e2e run. */
export async function bootstrapAdmin(page: Page) {
  await page.goto("/setup");
  await page.locator("#setupToken").fill(SETUP_TOKEN);
  await page.locator("#name").fill("E2E Admin");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.click('button[type="submit"]');
}

export async function completeOnboarding(page: Page) {
  await page.waitForURL(/\/onboarding/);
  // Each step is a client-side state transition, not a navigation, so a
  // fixed sequence of `getByText("Continue").click()` calls can outrun the
  // re-render and click the previous step's button again (or race an
  // ambiguous match). Wait for each step's own heading before clicking its
  // Continue, and scope the click to the button role so it can't match
  // stray "Continue" text elsewhere on the page.
  await expect(
    page.getByRole("heading", { name: "Welcome to RadTempo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Before you start" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Study types" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Favorites (optional)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start using RadTempo" }).click();
  await page.waitForURL("/");
}

/** Caches the given (already admin-authenticated) page's session so later
 * `createInvitedUser` calls in other specs skip a redundant admin sign-in.
 * Call once, right after the admin's own login, from whichever spec logs
 * in as the admin first. A no-op if a cache already exists. */
export async function cacheAdminSession(page: Page) {
  if (existsSync(ADMIN_STATE_PATH)) return;
  mkdirSync(path.dirname(ADMIN_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE_PATH });
}

/**
 * Returns an admin-authenticated invite link, using a cached login session
 * (see module doc) so repeated calls across specs don't each spend one of
 * the admin's 5-per-60s sign-in attempts.
 */
async function createInviteLink(page: Page): Promise<string> {
  const browser = page.context().browser();
  if (!browser) throw new Error("createInviteLink needs a real browser");

  if (!existsSync(ADMIN_STATE_PATH)) {
    mkdirSync(path.dirname(ADMIN_STATE_PATH), { recursive: true });
    const bootstrapPage = await browser.newPage();
    await login(bootstrapPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await bootstrapPage.waitForURL((url) => url.pathname !== "/login");
    if (bootstrapPage.url().includes("/onboarding")) {
      await completeOnboarding(bootstrapPage);
    }
    await bootstrapPage.context().storageState({ path: ADMIN_STATE_PATH });
    await bootstrapPage.close();
  }

  const adminContext = await browser.newContext({
    storageState: ADMIN_STATE_PATH,
  });
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/admin");
  await adminPage.getByRole("button", { name: "Create invite" }).click();
  const inviteCode = adminPage
    .locator("code")
    .filter({ hasText: /register\?invite=/ });
  await expect(inviteCode).toBeVisible();
  const inviteLink = await inviteCode.textContent();
  await adminContext.close();

  if (!inviteLink) throw new Error("Invite link did not render");
  return inviteLink;
}

/**
 * Registers and onboards a brand-new regular user via an admin invite (see
 * createInviteLink above), on the given page. Returns the new user's
 * credentials, already logged in and onboarded at "/". This is the only
 * sign-in this helper spends against the rate limit.
 */
export async function createInvitedUser(
  page: Page,
  namePrefix: string,
): Promise<{ email: string; password: string }> {
  const email = `e2e-${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "supersecret123";

  const inviteLink = await createInviteLink(page);
  const url = new URL(inviteLink);
  const inviteToken = url.searchParams.get("invite");

  await page.goto(`/register?invite=${inviteToken}`);
  await page.locator("#name").fill(namePrefix);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/login/);

  await login(page, email, password);
  await completeOnboarding(page);

  return { email, password };
}
