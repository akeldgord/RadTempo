"use server";

import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { requireUser } from "@/server/auth-helpers";
import { type ActionResult, toActionError } from "@/server/action-result";
import { deleteOwnAccount, LastAdminError } from "./service";

/**
 * Deletes the caller's own account (see `deleteOwnAccount` for the
 * confirmation and last-admin checks, and `src/db/schema.ts` for the
 * cascading FKs that remove every row it owns), clears their session
 * cookie, and redirects to `/login`. On failure, returns an `ActionResult`
 * so the settings page can show the reason instead of navigating away.
 */
export async function deleteAccountAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const confirmEmail = String(formData.get("confirmEmail") ?? "");

    await deleteOwnAccount(db, user.id, { confirmEmail });

    const signOutResponse = await auth.api.signOut({
      headers: await nextHeaders(),
      asResponse: true,
    });
    const cookieStore = await cookies();
    for (const rawCookie of signOutResponse.headers.getSetCookie()) {
      const name = rawCookie.split("=", 1)[0]?.trim();
      if (name) cookieStore.delete(name);
    }
  } catch (error) {
    if (error instanceof LastAdminError) {
      return { ok: false, error: error.message };
    }
    return toActionError(error, "Could not delete your account.");
  }

  redirect("/login");
}
