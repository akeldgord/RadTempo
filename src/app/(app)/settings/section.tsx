import { cn } from "@/lib/utils";

/**
 * Shared settings-page section layout: a left-column label on desktop,
 * stacked on mobile, separated by hairlines rather than boxed cards.
 * Local to the settings/admin pages (not a shared primitive).
 */
export function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "grid gap-x-8 gap-y-3 border-t border-border py-6 sm:grid-cols-[200px_1fr]",
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
