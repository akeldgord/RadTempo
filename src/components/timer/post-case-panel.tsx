"use client";

import { useEffect, useState } from "react";
import { useTimer } from "./timer-context";
import { listTagsAction, createTagAction } from "@/features/tags/actions";
import type { Tag } from "@/features/tags/service";
import type { Complexity } from "@/features/analytics/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Caliper } from "@/components/caliper";
import { formatDuration } from "@/features/analytics/engine";
import { AchievementToast } from "@/components/achievements/achievement-toast";

const COMPLEXITIES: { value: Complexity; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "TYPICAL", label: "Typical" },
  { value: "DIFFICULT", label: "Difficult" },
];

/** Non-modal post-case panel: complexity, tags, and calm feedback text.
 * See docs/SPEC.md "Post-case panel" and "Immutability". */
export function PostCasePanel() {
  const { panel, setPanelComplexity, setPanelTags, closePanel } = useTimer();
  const [tags, setTags] = useState<Tag[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    void listTagsAction().then((res) => {
      if (res.ok) setTags(res.data);
    });
  }, [panel?.entry.id]);

  if (!panel) return null;

  const selectedTagIds = new Set(panel.entry.tagIds);

  async function toggleTag(tagId: string) {
    const next = selectedTagIds.has(tagId)
      ? panel!.entry.tagIds.filter((id) => id !== tagId)
      : [...panel!.entry.tagIds, tagId];
    await setPanelTags(next);
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    const result = await createTagAction({ name });
    if (!result.ok) {
      setTagError(result.error);
      return;
    }
    setTags((prev) => [...prev, result.data]);
    setNewTagName("");
    setCreating(false);
    setTagError(null);
    await setPanelTags([...panel!.entry.tagIds, result.data.id]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-foreground">
            Completed in {panel.durationText}
          </p>
          <p className="mt-0.5 text-sm text-muted">{panel.feedbackText}</p>
        </div>
        <Button type="button" size="sm" onClick={closePanel}>
          Done
        </Button>
      </div>

      {panel.feedback.recentPaceMs !== null && (
        <div className="max-w-sm">
          <Caliper
            className="w-full"
            recentMs={panel.feedback.recentPaceMs}
            thisReadMs={panel.entry.activeDurationMs}
            animateThisRead
            formatDuration={formatDuration}
          />
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Complexity
        </span>
        <div
          className="inline-flex rounded-md border border-border"
          role="group"
          aria-label="Complexity"
        >
          {COMPLEXITIES.map(({ value, label }) => {
            const pressed = panel.entry.complexity === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={pressed}
                onClick={() => void setPanelComplexity(value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  pressed
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:bg-muted-bg"
                }`}
              >
                {label}
                {value === "TYPICAL" && !pressed ? "" : pressed ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Tags
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => {
            const active = selectedTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() => void toggleTag(tag.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-foreground hover:bg-muted-bg"
                }`}
              >
                {tag.name}
              </button>
            );
          })}

          {creating ? (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateTag();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="New tag name"
                className="h-7 w-36 text-xs"
              />
              <Button type="button" size="sm" onClick={handleCreateTag}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              + Custom tag
            </button>
          )}
        </div>
        {creating && (
          <p className="mt-1.5 text-xs text-danger">
            Do not enter patient information or other PHI.
          </p>
        )}
        {tagError && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {tagError}
          </p>
        )}
      </div>

      {panel.newAchievements.length > 0 && (
        <AchievementToast
          key={panel.entry.id}
          achievements={panel.newAchievements}
        />
      )}
    </div>
  );
}
