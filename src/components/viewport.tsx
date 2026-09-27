import { cn } from "@/lib/utils";

/**
 * Reading Room grid: a hanging-protocol layout of viewport panels
 * separated by thin gutters, in place of a stack of identical cards.
 * See DESIGN_NOTES.md, direction A.
 */
export function ViewportGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border-2 border-border bg-border sm:grid-cols-2 lg:grid-cols-3",
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
}

/** A single viewport panel with DICOM-style corner overlays. */
export function Viewport({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  children,
  className,
  ...props
}: ViewportProps) {
  return (
    <article
      className={cn(
        "relative flex min-h-56 flex-col justify-between gap-3 bg-card p-4 transition-colors sm:p-5",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-[70%] text-sm font-semibold leading-snug text-foreground">
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
