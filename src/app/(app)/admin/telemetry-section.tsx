"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateTelemetryAction } from "@/features/admin/actions";
import { Section } from "./section";

export function TelemetrySection({
  telemetryEnabled,
  fields,
}: {
  telemetryEnabled: boolean;
  fields: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateTelemetryAction,
    null,
  );

  return (
    <Section
      title="Telemetry"
      description="Off by default. Instance-level only — never per-user. The app behaves identically whether this is on or off."
    >
      <p className="text-sm text-foreground">
        If enabled, and only if{" "}
        <code className="rounded bg-muted-bg px-1">TELEMETRY_ENDPOINT</code> is
        configured, exactly these fields are sent, nothing else:
      </p>
      <ul className="list-disc pl-5 text-sm text-foreground">
        {fields.map((field) => (
          <li key={field}>
            <code>{field}</code>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Never sent: emails, user ids, study names, durations, complexity, tags,
        clinical timestamps, IP addresses, or free text.
      </p>
      <form action={formAction} className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="telemetryEnabled"
            value="true"
            defaultChecked={telemetryEnabled}
          />
          Enable anonymous telemetry
        </label>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </form>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {telemetryEnabled && (
        <p className="text-sm text-muted">
          Nothing is sent unless <code>TELEMETRY_ENDPOINT</code> is also
          configured for this instance.
        </p>
      )}
    </Section>
  );
}
