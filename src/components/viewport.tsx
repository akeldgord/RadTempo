import { cn } from "@/lib/utils";

/**
 * Reading Room grid: a hanging-protocol layout of viewport panels
 * separated by thin gutters, in place of a stack of identical cards.
 * See DESIGN_NOTES.md, direction A.
 */
export function ViewportGrid({
  className,
  /** When true, lays out children with `flex-wrap` instead of the fixed
   * 1/2/3-column grid, and each child is expected to carry its own
   * `flex-1` sizing (see Start's `FavoriteTile`). Flexbox distributes
   * leftover space among the items already on a row, so a row that
   * doesn't fill evenly never exposes the container's border-colored
   * background as an empty cell — unlike a fixed grid, where an item
   * count that doesn't divide evenly leaves a bare gutter-colored gap.
   * Used for the Start page's Favorites/search-results tiles, whose
   * count varies. */
  fitContent = false,
  ...props
}: React.ComponentProps<"div"> & { fitContent?: boolean }) {
  return (
    <div
      className={cn(
        "gap-px overflow-hidden rounded-lg border-2 border-border bg-border",
        fitContent
          ? "flex flex-wrap"
          : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export interface ViewportProps extends React.ComponentProps<"article"> {
  /** Top-left overlay: the study/subject name. */
  topLeft: React.ReactNode;
  /** Top-right overlay: secondary metadata (e.g. reads count, maturity). */
  topRight?: React.ReactNode;
  /** Bottom-left overlay: the headline figure (e.g. a Duration). */
  bottomLeft?: React.ReactNode;
  /** Bottom-right overlay: the comparison figure/trend text. */
  bottomRight?: React.ReactNode;
  /** The center graphic, e.g. a Caliper. */
  children?: React.ReactNode;
  /** Compact sizing for simple one-click tiles with no center graphic
   * (e.g. Start's favorite tiles) — much shorter than the data-rich
   * dashboard/analytics viewports, which need room for a Caliper. */
  compact?: boolean;
}

/** A single viewport panel with DICOM-style corner overlays. */
export function Viewport({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  children,
  className,
  compact = false,
  ...props
}: ViewportProps) {
  return (
    <article
      className={cn(
        "relative flex flex-col justify-between bg-card transition-colors",
        compact
          ? "min-h-16 gap-1.5 p-3 sm:min-h-24 sm:p-4"
          : "min-h-56 gap-3 p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "font-semibold leading-snug text-foreground",
            // Only cap the title's width when there's a topRight overlay to
            // share the row with — otherwise let it use the full width.
            // Names are allowed to wrap onto multiple lines (never
            // line-clamped/truncated): common favorites like "CT
            // Abdomen/Pelvis with contrast" or "MRI Abdomen with & without
            // contrast" need more than two lines at narrow widths, and every
            // accessible name must stay fully visible, not truncated.
            topRight ? "max-w-[70%]" : "max-w-full",
            "text-sm",
          )}
        >
          {topLeft}
        </div>
        {topRight && (
          <div className="text-right text-xs text-muted">{topRight}</div>
        )}
      </div>

      {children && <div className="flex flex-1 items-center">{children}</div>}

      {(bottomLeft || bottomRight) && (
        <div className="flex items-end justify-between gap-3">
          <div>{bottomLeft}</div>
          <div className="text-right">{bottomRight}</div>
        </div>
      )}
    </article>
  );
}
