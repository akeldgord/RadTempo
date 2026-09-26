"use client";

/**
 * Study-detail raw vs. adjusted weekly median trend. Calm two-line chart:
 * a muted raw line and a primary-colored adjusted line, CSS-variable colors
 * so it holds up in light and dark, a legend (never color-only — the
 * legend and tooltip both label lines by name), and a full summary table
 * underneath as the text alternative.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/features/analytics/types";
import { formatDuration } from "@/features/analytics/engine";

function minutesTick(ms: number): string {
  return formatDuration(ms);
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted">
        No history yet for this window. Once you have a few comparable cases,
        your raw and complexity-adjusted trend will appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="bucketStart"
              stroke="var(--muted)"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              stroke="var(--muted)"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickFormatter={minutesTick}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
              }}
              formatter={(value, name) => [
                formatDuration(Number(value)),
                String(name),
              ]}
              labelFormatter={(label) => `Week of ${label}`}
            />
            <Legend
              formatter={(value) => (
                <span style={{ color: "var(--foreground)" }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="rawMedianMs"
              name="Raw median"
              stroke="var(--muted)"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="adjustedMedianMs"
              name="Complexity-adjusted median"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Trend data table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Weekly raw and complexity-adjusted median reading time
            </caption>
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="py-1 pr-4 font-medium">
                  Week of
                </th>
                <th scope="col" className="py-1 pr-4 font-medium">
                  Raw median
                </th>
                <th scope="col" className="py-1 pr-4 font-medium">
                  Adjusted median
                </th>
                <th scope="col" className="py-1 font-medium">
                  Cases
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.bucketStart} className="border-b border-border">
                  <td className="py-1 pr-4 text-foreground">{p.bucketStart}</td>
                  <td className="py-1 pr-4 text-foreground">
                    {formatDuration(p.rawMedianMs)}
                  </td>
                  <td className="py-1 pr-4 text-foreground">
                    {formatDuration(p.adjustedMedianMs)}
                  </td>
                  <td className="py-1 text-foreground">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
