import { cn } from "@/lib/utils";

/**
 * Structural loading placeholder. A static, low-contrast block using
 * design tokens — no shimmer/pulse animation, matching the calm, quiet
 * tone (see docs/SPEC.md) and honoring prefers-reduced-motion globally.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted-bg", className)}
      {...props}
    />
  );
}
