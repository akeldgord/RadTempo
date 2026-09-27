import { cn } from "@/lib/utils";

/**
 * Renders a duration/timer/numeric figure in the mono type family with
 * tabular figures, so digits never shift. Mono is reserved for this use —
 * never for labels or body text.
 */
export function Duration({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("font-mono tabular-nums text-foreground", className)}
      {...props}
    >
      {children}
    </span>
  );
}
