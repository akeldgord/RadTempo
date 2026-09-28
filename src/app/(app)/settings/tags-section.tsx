"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  createTagAction,
  deleteTagAction,
  updateTagAction,
} from "@/features/tags/actions";
import type { Tag } from "@/features/tags/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "./section";

export function TagsSection({ initialTags }: { initialTags: Tag[] }) {
  const [tags, setTags] = useState(initialTags);
  const [newTagName, setNewTagName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const name = newTagName.trim();
    if (!name) return;
    const result = await createTagAction({ name });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTags((prev) => [...prev, result.data]);
    setNewTagName("");
    setError(null);
  }

  async function handleToggleExclude(tag: Tag) {
    const result = await updateTagAction(tag.id, {
      excludeFromBenchmark: !tag.excludeFromBenchmark,
    });
    if (result.ok) {
      setTags((prev) => prev.map((t) => (t.id === tag.id ? result.data : t)));
    }
  }

  async function handleDelete(tag: Tag) {
    const result = await deleteTagAction(tag.id);
    if (result.ok) {
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } else {
      setError(result.error);
    }
  }

  return (
    <Section title="Tags">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="text-sm text-foreground">
              {tag.name}
              {tag.builtIn && (
                <span className="ml-2 text-xs text-muted">Built-in</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                Exclude from benchmark
                <Switch
                  checked={tag.excludeFromBenchmark}
                  disabled={tag.builtIn}
                  onCheckedChange={() => void handleToggleExclude(tag)}
                />
              </label>
              {!tag.builtIn && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete tag ${tag.name}`}
                  onClick={() => void handleDelete(tag)}
                >
                  <Trash2
                    size={14}
                    className="text-danger"
                    aria-hidden="true"
                  />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="New tag name"
          className="max-w-56"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <Button type="button" size="sm" onClick={handleCreate}>
          Add tag
        </Button>
      </div>
      <p className="text-xs text-danger">
        Do not enter patient information or other PHI.
      </p>
    </Section>
  );
}
