"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hasAnyUsers } from "@/server/setup-status";
import { auth } from "@/lib/auth";
import {
  runExclusiveFirstUserSetup,
  runWithRegistrationAllowed,
} from "@/server/registration-gate";

const schema = z.object({
  setupToken: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export type SetupResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Could not create the admin account.";

/**
 * Constant-time comparison of the submitted setup token against
 * `process.env.SETUP_TOKEN`, comparing SHA-256 digests (so
 * `timingSafeEqual`, which requires equal-length buffers, never leaks the
 * expected token's length via an early length mismatch).
 */
function setupTokenMatches(submitted: string): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return false;

  const submittedDigest = createHash("sha256").update(submitted).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(submittedDigest, expectedDigest);
}

export async function setupAction(
  _prev: SetupResult | null,
  formData: FormData,
): Promise<SetupResult> {
  if (await hasAnyUsers()) {
    return { ok: false, error: "Setup has already been completed." };
  }

  if (!process.env.SETUP_TOKEN) {
    // Fail closed: never accept any submitted token when no token was
    // configured — there is no fallback bypass.
    return { ok: false, error: GENERIC_ERROR };
  }

  const parsed = schema.safeParse({
    setupToken: formData.get("setupToken"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  if (!setupTokenMatches(parsed.data.setupToken)) {
    // Never reveal whether the token was wrong vs. some other failure.
    return { ok: false, error: GENERIC_ERROR };
  }

  try {
    await runExclusiveFirstUserSetup(async () => {
      // Re-check inside the lock: another setup attempt (or
      // bootstrapInitialAdmin) may have created the first user while we
      // were validating the form above.
      if (await hasAnyUsers()) {
        throw new Error("Setup has already been completed.");
      }

      // First user becomes ADMIN automatically (see databaseHooks in
      // src/lib/auth.ts); being first never grants permission on its
      // own — only this trusted, token-gated context does.
      await runWithRegistrationAllowed(() =>
        auth.api.signUpEmail({
          body: {
            name: parsed.data.name,
            email: parsed.data.email,
            password: parsed.data.password,
          },
        }),
      );
    });
    return { ok: true };
  } catch {
    // Never log the submitted token, and never distinguish "already set
    // up" from any other failure to the client beyond the generic message.
    return { ok: false, error: GENERIC_ERROR };
  }
}
