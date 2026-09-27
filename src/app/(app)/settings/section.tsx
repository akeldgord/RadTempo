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
        // minmax(0, 1fr), not a plain 1fr: a grid track's automatic
        // minimum size is its content's min-content width unless
        // overridden, so wide unwrappable content in this column (e.g.
        // the import file input, or a table's own overflow-x-auto
        // wrapper) could force the track — and the whole page — wider
        // than the viewport instead of shrinking to fit and scrolling
        // internally. See DESIGN_NOTES.md "R3 verification".
        "grid gap-x-8 gap-y-3 border-t border-border py-6 sm:grid-cols-[200px_minmax(0,1fr)]",
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
