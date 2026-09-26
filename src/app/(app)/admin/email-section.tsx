"use client";

import { useActionState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  sendTestEmailAction,
  updateEmailVerificationAction,
} from "@/features/admin/actions";

export function EmailSection({
  smtpEnabled,
  smtpHost,
  emailVerificationRequired,
}: {
  smtpEnabled: boolean;
  smtpHost: string | null;
  emailVerificationRequired: boolean;
}) {
  const [verificationState, verificationAction, verificationPending] =
    useActionState(updateEmailVerificationAction, null);
  const [testState, testAction, testPending] = useActionState(
    async () => sendTestEmailAction(),
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          SMTP host and credentials are configured via environment variables and
          never shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-foreground">
          SMTP configured:{" "}
          <span className="font-medium">
            {smtpEnabled ? `Yes (${smtpHost ?? "configured"})` : "No"}
          </span>
        </p>

        <form
          action={verificationAction}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="emailVerificationRequired"
              value="true"
              defaultChecked={emailVerificationRequired}
              disabled={!smtpEnabled}
            />
            Require email verification
            {!smtpEnabled && (
              <span className="text-muted"> (requires SMTP)</span>
            )}
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={verificationPending || !smtpEnabled}
          >
            {verificationPending ? "Saving..." : "Save"}
          </Button>
          {verificationState && !verificationState.ok && (
            <p role="alert" className="w-full text-sm text-danger">
              {verificationState.error}
            </p>
          )}
        </form>

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
      </CardContent>
    </Card>
  );
}
