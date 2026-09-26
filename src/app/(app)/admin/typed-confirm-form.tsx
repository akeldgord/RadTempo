"use client";

import { useEffect, useId, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/features/admin/actions";

/**
 * A destructive/irreversible action gated behind typing an exact
 * confirmation phrase, rather than a plain checkbox. Renders inline
 * (expand-on-click) rather than as a modal, but is otherwise a normal,
 * labeled, keyboard-accessible form.
 */
export function TypedConfirmForm<T extends object = Record<string, never>>({
  action,
  hidden,
  confirmPhrase,
  triggerLabel,
  submitLabel,
  description,
  variant = "danger",
  onSuccess,
}: {
  action: (
    prev: ActionResult<T> | null,
    formData: FormData,
  ) => Promise<ActionResult<T>>;
  hidden: Record<string, string>;
  confirmPhrase: string;
  triggerLabel: string;
  submitLabel: string;
  description?: string;
  variant?: "danger" | "secondary";
  onSuccess?: (result: ActionResult<T> & { ok: true }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const [state, formAction, pending] = useActionState<
    ActionResult<T> | null,
    FormData
  >(action, null);

  useEffect(() => {
    if (state?.ok && onSuccess) {
      onSuccess(state as ActionResult<T> & { ok: true });
    }
  }, [state, onSuccess]);

  if (!open) {
    return (
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-md border border-border bg-muted-bg p-3"
    >
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {description && <p className="text-sm text-muted">{description}</p>}
      <Label htmlFor={inputId}>
        Type <span className="font-mono font-semibold">{confirmPhrase}</span> to
        confirm
      </Label>
      <Input
        id={inputId}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={variant}
          size="sm"
          disabled={typed !== confirmPhrase || pending}
        >
          {pending ? "Working..." : submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
