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
import { Label } from "@/components/ui/label";
import { updateRegistrationModeAction } from "@/features/admin/actions";
import type { RegistrationMode } from "@/server/settings";

export function RegistrationSection({
  registrationMode,
}: {
  registrationMode: RegistrationMode;
}) {
  const [state, formAction, pending] = useActionState(
    updateRegistrationModeAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration</CardTitle>
        <CardDescription>
          Controls whether new users can sign themselves up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registration-mode">Mode</Label>
            <select
              id="registration-mode"
              name="registrationMode"
              defaultValue={registrationMode}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="invite_only">Invite only</option>
              <option value="open">Open</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          {state && !state.ok && (
            <p role="alert" className="w-full text-sm text-danger">
              {state.error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
