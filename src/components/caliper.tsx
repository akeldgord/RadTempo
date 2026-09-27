import { CaliperMarker } from "@/components/caliper-marker";

const WIDTH = 300;
const HEIGHT = 46;
const INSET = 12;
const TRACK_Y = 20;

export interface CaliperProps {
  /** Recent pace in ms — drawn as the amber diamond marker. Required. */
  recentMs: number;
  /** Previous pace in ms — drawn as a dashed reference tick, when known. */
  previousMs?: number | null;
  /** "This read" pace in ms — an optional extra marker for a single case,
   * e.g. on a study-detail page after Finish. */
  thisReadMs?: number | null;
  /** When true, the "this read" marker slides in from the recent-pace
   * position on mount (≤300ms ease-out; instant under reduced motion, via
   * the global transition-duration override). Used for the one orchestrated
   * moment in the post-case panel — see docs/SPEC.md. */
  animateThisRead?: boolean;
  /** Formats a duration in ms for the tick labels (mm:ss). */
  formatDuration: (ms: number) => string;
  className?: string;
}

/**
 * A ruled scale (the "caliper") showing recent pace against previous pace,
 * the way a DICOM measurement annotation marks a distance. Purely
 * presentational — no data fetching. See DESIGN_NOTES.md, direction A.
 */
export function Caliper({
  recentMs,
  previousMs,
  thisReadMs,
  animateThisRead = false,
  formatDuration,
  className,
}: CaliperProps) {
  const values = [recentMs, previousMs, thisReadMs].filter(
    (v): v is number => typeof v === "number",
  );
  const lo = Math.min(...values) * 0.82;
  const hi = Math.max(...values) * 1.14;
  const span = hi - lo || 1;
  const x = (v: number) => INSET + ((v - lo) / span) * (WIDTH - INSET * 2);

  const ticks = Array.from({ length: 21 }, (_, i) => {
    const tx = INSET + (i * (WIDTH - INSET * 2)) / 20;
    const major = i % 5 === 0;
    return (
      <line
        key={i}
        x1={tx}
        x2={tx}
        y1={TRACK_Y}
        y2={major ? TRACK_Y + 9 : TRACK_Y + 5}
        stroke="var(--color-overlay)"
        strokeOpacity={0.6}
      />
    );
  });

  const recentX = x(recentMs);

  const label = [
    `Recent pace ${formatDuration(recentMs)}`,
    previousMs != null ? `previous pace ${formatDuration(previousMs)}` : null,
    thisReadMs != null ? `this read ${formatDuration(thisReadMs)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-label={label}
      className={className}
    >
      <line
        x1={INSET}
        x2={WIDTH - INSET}
        y1={TRACK_Y}
        y2={TRACK_Y}
        stroke="var(--color-overlay)"
        strokeOpacity={0.6}
      />
      {ticks}
      {previousMs != null && (
        <>
          <line
            x1={x(previousMs)}
            x2={x(previousMs)}
            y1={8}
            y2={34}
            stroke="var(--color-overlay)"
            strokeDasharray="2 2"
          />
          <text
            x={x(previousMs)}
            y={44}
            textAnchor="middle"
            fill="var(--color-overlay)"
            fontSize={10.5}
            fontFamily="var(--font-mono)"
          >
            prev {formatDuration(previousMs)}
          </text>
          <line
            x1={recentX}
            x2={x(previousMs)}
            y1={14}
            y2={14}
            stroke="var(--color-caliper)"
            strokeWidth={1}
          />
        </>
      )}
      {thisReadMs != null &&
        (animateThisRead ? (
          <CaliperMarker fromX={recentX} toX={x(thisReadMs)} cy={TRACK_Y} />
        ) : (
          <circle
            cx={x(thisReadMs)}
            cy={TRACK_Y}
            r={3.5}
            fill="var(--color-viewport)"
            stroke="var(--color-caliper)"
            strokeWidth={2}
          />
        ))}
      <path
        d={`M${recentX} 7 l6 7 l-6 7 l-6 -7z`}
        fill="var(--color-caliper)"
      />
    </svg>
  );
}
