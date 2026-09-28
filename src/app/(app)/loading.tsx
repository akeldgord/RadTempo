import { Skeleton } from "@/components/skeleton";

/** Route-level loading skeleton for the app segment. Tokens only, no
 * spinner — a quiet placeholder matching the page shell it replaces. */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border-2 border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-56 flex-col gap-4 bg-card p-4 sm:p-5"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
