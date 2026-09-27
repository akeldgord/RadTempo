import { test, expect } from "@playwright/test";
import { createInvitedUser } from "./helpers";

/**
 * Sign-in rate limiting (SPEC "Security baseline"): Better Auth's
 * per-route rate limit on /sign-in/email caps failed attempts at a low
 * per-minute threshold, keyed by client IP. Runs last (filename sorts
 * after every other spec) because tripping it leaves the test runner's
 * IP rate-limited for the remainder of the configured window, which would
 * otherwise block logins that other specs still need to perform.
 */
test("sign-in rate limiting: rapid failed logins return 429", async ({
  page,
}) => {
  const { email } = await createInvitedUser(page, "ratelimit");

  let sawRateLimited = false;
  for (let i = 0; i < 8; i++) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password: "wrong-password-attempt" },
      headers: { "content-type": "application/json" },
    });
    if (res.status() === 429) {
      sawRateLimited = true;
      break;
    }
  }
  expect(sawRateLimited).toBe(true);
});
