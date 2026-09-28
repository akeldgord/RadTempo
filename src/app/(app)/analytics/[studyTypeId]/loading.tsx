import { Skeleton } from "@/components/skeleton";

/** Loading skeleton for the study-analytics detail page (charts, tables,
 * filters) — heavier than the app-segment default, so it gets its own. */
export default function AnalyticsDetailLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
