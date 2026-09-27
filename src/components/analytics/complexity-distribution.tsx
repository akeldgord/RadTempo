/**
 * Easy/Typical/Difficult case distribution. Three categories don't need a
 * chart library — plain labeled bars are calmer and just as clear, and the
 * count is always shown as text (never color-only).
 */

import type { ComplexityDistribution } from "@/features/analytics/types";

const ROWS: { key: keyof ComplexityDistribution; label: string }[] = [
  { key: "EASY", label: "Easy" },
  { key: "TYPICAL", label: "Typical" },
  { key: "DIFFICULT", label: "Difficult" },
];

export function ComplexityDistributionBars({
  distribution,
}: {
  distribution: ComplexityDistribution;
}) {
  const total =
    distribution.EASY + distribution.TYPICAL + distribution.DIFFICULT;

  return (
    <div
      className="flex flex-col gap-2"
      role="table"
      aria-label="Complexity distribution"
    >
      {ROWS.map(({ key, label }) => {
        const count = distribution[key];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="flex items-center gap-3 text-sm" role="row">
            <span className="w-16 shrink-0 text-foreground" role="cell">
              {label}
            </span>
            <div
              className="h-2 flex-1 rounded-full bg-muted-bg"
              aria-hidden="true"
            >
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-muted" role="cell">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
