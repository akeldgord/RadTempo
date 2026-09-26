"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth-helpers";
import {
  assertNotMaintenance,
  updateInstanceSettings,
} from "@/server/settings";
import { isSmtpConfigured, sendMail } from "@/server/mailer";
import { sendTelemetry } from "@/features/admin/telemetry";
import { getAppVersion } from "@/features/admin/system";
import {
  AdminActionError,
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  inviteUser,
  resetUserCredentials,
  revokeInvite,
  setUserRole,
  type Role,
} from "@/features/admin/users";

export type ActionResult<T extends object = Record<string, unknown>> =
  ({ ok: true } & T) | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof AdminActionError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function revalidateAdmin() {
  revalidatePath("/admin");
}

export async function createUserAction(
  _prev: ActionResult<{ email: string; temporaryPassword: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string; temporaryPassword: string }>> {
  try {
    await requireAdmin();
    await assertNotMaintenance();

    const email = String(formData.get("email") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = (formData.get("role") === "ADMIN" ? "ADMIN" : "USER") as Role;

    if (!email || !name) {
      return { ok: false, error: "Name and email are required." };
    }

    const { temporaryPassword } = await createUser({ email, name, role });
    revalidateAdmin();
    return { ok: true, email, temporaryPassword };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function inviteUserAction(
  _prev: ActionResult<{ link: string; emailed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  try {
    const admin = await requireAdmin();
    await assertNotMaintenance();

    const emailRaw = String(formData.get("email") ?? "").trim();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const { link, emailed } = await inviteUser({
      createdBy: admin.id,
      email: emailRaw || null,
      appUrl,
    });

    revalidateAdmin();
    return { ok: true, link, emailed };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function revokeInviteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    const inviteId = String(formData.get("inviteId") ?? "");
    if (!inviteId) return { ok: false, error: "Missing invite id." };
    await revokeInvite(inviteId);
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setUserDisabledAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    const userId = String(formData.get("userId") ?? "");
    const disabled = formData.get("disabled") === "true";
    if (!userId) return { ok: false, error: "Missing user id." };

    if (disabled) {
      await disableUser(userId);
    } else {
      await enableUser(userId);
    }

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function deleteUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await assertNotMaintenance();
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return { ok: false, error: "Missing user id." };
    await deleteUser(userId, admin.id);
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setUserRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await assertNotMaintenance();
    const userId = String(formData.get("userId") ?? "");
    const role = (formData.get("role") === "ADMIN" ? "ADMIN" : "USER") as Role;
    if (!userId) return { ok: false, error: "Missing user id." };
    await setUserRole(userId, role, admin.id);
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function resetCredentialsAction(
  _prev: ActionResult<{ temporaryPassword: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return { ok: false, error: "Missing user id." };
    const { temporaryPassword } = await resetUserCredentials(userId);
    revalidateAdmin();
    return { ok: true, temporaryPassword };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateRegistrationModeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    const mode =
      formData.get("registrationMode") === "open" ? "open" : "invite_only";
    await updateInstanceSettings({ registrationMode: mode });
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateEmailVerificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    if (!isSmtpConfigured()) {
      return {
        ok: false,
        error: "Email verification requires SMTP to be configured.",
      };
    }
    const required = formData.get("emailVerificationRequired") === "true";
    await updateInstanceSettings({ emailVerificationRequired: required });
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!isSmtpConfigured()) {
      return { ok: false, error: "SMTP is not configured." };
    }
    const { sent } = await sendMail({
      to: admin.email,
      subject: "RadTempo test email",
      text: "This is a test email from your RadTempo instance's admin panel. If you received this, SMTP is working.",
    });
    if (!sent) {
      return { ok: false, error: "Failed to send test email." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateTelemetryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await assertNotMaintenance();
    const enabled = formData.get("telemetryEnabled") === "true";
    const settings = await updateInstanceSettings({
      telemetryEnabled: enabled,
    });

    // Fire-and-forget, aggregate-only, no-op unless enabled AND an endpoint
    // is configured. Never throws.
    sendTelemetry({
      enabled: settings.telemetryEnabled,
      appVersion: getAppVersion(),
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setMaintenanceModeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const maintenanceMode = formData.get("maintenanceMode") === "true";
    await updateInstanceSettings({ maintenanceMode });
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
