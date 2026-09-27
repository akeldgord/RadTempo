import { cn } from "@/lib/utils";

/** Shared page-header pattern: h1 at 28/34px with a one-line subtitle,
 * optionally paired with a right-aligned note (e.g. a comparison window)
 * or actions. */
export function PageHeader({
  title,
  subtitle,
  aside,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {aside && <p className="text-sm text-muted">{aside}</p>}
    </div>
  );
}
