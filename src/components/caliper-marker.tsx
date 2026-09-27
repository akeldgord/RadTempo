"use client";

import { useEffect, useState } from "react";

/**
 * The animated "this read" marker on the Caliper, split into its own client
 * component so Caliper itself stays a plain (server-renderable) component —
 * it's used from both server components (Dashboard) and client components
 * (the post-case panel), and only the latter needs the mount animation.
 * Takes only numeric coordinates, never a function prop, so it can be
 * rendered from either side of the server/client boundary. Slides from
 * `fromX` to `toX` on mount (≤300ms ease-out; instant under reduced motion
 * via the global transition-duration override).
 *
 * Animates a `transform: translateX(...)` rather than the SVG `cx`
 * attribute — `cx` is a geometry property that forces layout/paint on
 * every frame, while `transform` is compositor-only. The circle is drawn
 * at its resting position (`toX`) and offset by `fromX - toX` up front,
 * then that offset is animated back to 0.
 */
export function CaliperMarker({
  fromX,
  toX,
  cy,
}: {
  fromX: number;
  toX: number;
  cy: number;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <circle
      cx={toX}
      cy={cy}
      r={3.5}
      fill="var(--color-viewport)"
      stroke="var(--color-caliper)"
      strokeWidth={2}
      style={{
        transform: `translateX(${settled ? 0 : fromX - toX}px)`,
        transition: "transform 280ms ease-out",
      }}
    />
  );
}
