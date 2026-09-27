"use client";

/**
 * Small client button that starts a timer for a given study type, used from
 * Dashboard/Study-detail cards ("Start this study"). Reuses the existing
 * timer context so it behaves exactly like the Start page's buttons
 * (respects "one active timer" and redirects home once started).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTimer } from "@/components/timer/timer-context";
import { Button, type ButtonProps } from "@/components/ui/button";

export function StartStudyButton({
  studyTypeId,
  children = "Start this study",
  size,
  variant = "secondary",
}: {
  studyTypeId: string;
  children?: React.ReactNode;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  const router = useRouter();
  const { timer, start } = useTimer();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (timer) return;
    setPending(true);
    setError(null);
    const result = await start(studyTypeId);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Could not start the timer.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={!!timer || pending}
        onClick={() => void handleClick()}
      >
        {pending ? "Starting…" : children}
      </Button>
      {timer && (
        <p className="text-xs text-muted">
          Finish or discard your current timer first.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
