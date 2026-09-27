"use client";

/**
 * Thin client wrapper around the shared Caliper primitive for use from a
 * Server Component page. Caliper takes a `formatDuration` function prop,
 * which can't be passed from a Server Component (functions aren't
 * serializable across the RSC boundary) — this wrapper takes only plain
 * numbers and creates the function reference on the client instead.
 */
import { Caliper } from "@/components/caliper";
import { formatDuration } from "@/features/analytics/engine";

export function CaliperPanel({
  className,
  recentMs,
  previousMs,
}: {
  className?: string;
  recentMs: number;
  previousMs?: number | null;
}) {
  return (
    <Caliper
      className={className}
      recentMs={recentMs}
      previousMs={previousMs}
      formatDuration={formatDuration}
    />
  );
}
