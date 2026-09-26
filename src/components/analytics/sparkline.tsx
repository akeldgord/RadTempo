"use client";

/**
 * Calm, minimal weekly-median sparkline for a Dashboard study card. No
 * axes, no grid, no color-only meaning — a single quiet line plus a visually
 * hidden text summary for screen readers, per the accessible-charts
 * guidance (text alternative required, no chart junk).
 */

import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "@/features/analytics/types";
import { formatDuration } from "@/features/analytics/engine";

export function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const summary = `Weekly trend across ${points.length} weeks: adjusted median moved from ${formatDuration(
    first.adjustedMedianMs,
  )} to ${formatDuration(last.adjustedMedianMs)}.`;

  return (
    <div className="h-10 w-full">
      <p className="sr-only">{summary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          aria-hidden="true"
        >
          <Line
            type="monotone"
            dataKey="adjustedMedianMs"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
