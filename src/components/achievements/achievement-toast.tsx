"use client";

/**
 * Subtle celebration for newly-earned achievements. Exported so the timer
 * UI (post-case panel) can render it after a finish that returns
 * `newAchievements` — not wired in here, since this file must not edit the
 * timer UI. Calm, dismissible, never blocks or requires interaction.
 */

import { useState } from "react";
import { Trophy, X } from "lucide-react";
import type { NewlyEarnedAchievement } from "@/features/achievements/service";

/**
 * Render with a `key` derived from the finish event (e.g. the completed
 * entry's id) so React mounts a fresh instance — and a fresh dismiss
 * state — each time a new batch of achievements arrives.
 */
export function AchievementToast({
  achievements,
}: {
  achievements: NewlyEarnedAchievement[];
}) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  if (achievements.every((_, i) => dismissed.has(i))) return null;

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      {achievements.map((a, i) =>
        dismissed.has(i) ? null : (
          <div
            key={`${a.key}-${a.studyTypeId ?? "global"}`}
            className="flex items-start gap-3 rounded-md border border-border bg-accent px-4 py-3"
          >
            <Trophy
              size={16}
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{a.title}</p>
              <p className="text-sm text-muted">{a.description}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed((prev) => new Set(prev).add(i))}
              className="shrink-0 rounded-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ),
      )}
    </div>
  );
}
