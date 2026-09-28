"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary for the app segment. Plain explanation +
 * retry — no apology, no stack trace. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6"
    >
      <h1 className="text-lg font-semibold text-foreground">
        This page couldn&apos;t load
      </h1>
      <p className="text-sm text-muted">
        Something went wrong loading this page. Your data is unaffected.
      </p>
      <Button type="button" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
