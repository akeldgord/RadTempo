import { cn } from "@/lib/utils";

/**
 * Shared admin-page section layout: a left-column label on desktop, stacked
 * on mobile, separated by hairlines rather than boxed cards. Mirrors
 * settings/section.tsx but kept local to admin so each page ships in its
 * own commit.
 */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // minmax(0, 1fr), not a plain 1fr — see settings/section.tsx.
        "grid gap-x-8 gap-y-3 border-t border-border py-6 sm:grid-cols-[220px_minmax(0,1fr)]",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-xs text-muted">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
