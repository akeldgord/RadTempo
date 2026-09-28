"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { sendTestEmailAction } from "@/features/admin/actions";
import { Section } from "./section";

/**
 * Email verification is controlled entirely by the EMAIL_VERIFICATION_REQUIRED
 * env var (and whether SMTP is configured) — see `src/lib/auth.ts` and
 * docs/SPEC.md "Auth & accounts". There is no admin-editable DB setting;
 * this section only reports the resulting, computed status.
 */
function verificationStatusLabel(emailVerificationRequired: boolean): string {
  return emailVerificationRequired
    ? "Required — configured via environment"
    : "Not required";
}

export function EmailSection({
  smtpEnabled,
  smtpHost,
  emailVerificationRequired,
  emailVerificationEnvRequested,
}: {
  smtpEnabled: boolean;
  smtpHost: string | null;
  emailVerificationRequired: boolean;
  emailVerificationEnvRequested: boolean;
}) {
  const [testState, testAction, testPending] = useActionState(
    async () => sendTestEmailAction(),
    null,
  );

  return (
    <Section
      title="Email"
      description="SMTP host and credentials are configured via environment variables and never shown here."
    >
      <p className="text-sm text-foreground">
        SMTP configured:{" "}
        <span className="font-medium">
          {smtpEnabled ? `Yes (${smtpHost ?? "configured"})` : "No"}
        </span>
      </p>

      <p className="text-sm text-foreground">
        Email verification:{" "}
        <span className="font-medium">
          {verificationStatusLabel(emailVerificationRequired)}
        </span>
        {emailVerificationEnvRequested && !emailVerificationRequired && (
          <span className="block text-xs text-muted">
            Not enforced: SMTP not configured.
          </span>
        )}
        <span className="block text-xs text-muted">
          Configured via the EMAIL_VERIFICATION_REQUIRED environment variable —
          there is no in-app setting.
        </span>
      </p>

      <form action={testAction}>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={testPending || !smtpEnabled}
        >
          {testPending ? "Sending..." : "Send test email to my address"}
        </Button>
        {testState && !testState.ok && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {testState.error}
          </p>
        )}
        {testState?.ok && (
          <p className="mt-2 text-sm text-primary">Test email sent.</p>
        )}
      </form>
    </Section>
  );
}
