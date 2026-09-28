"use client";

import { useState } from "react";
import {
  resetKeyboardShortcutsAction,
  updatePreferencesAction,
} from "@/features/preferences/actions";
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts-provider";
import type { KeyboardShortcuts } from "@/features/preferences/service";
import { Button } from "@/components/ui/button";
import { Section } from "./section";

type SingleShortcutField =
  "openStudyPicker" | "pauseResume" | "finish" | "hideShowTimer";

const FIELD_LABELS: Record<SingleShortcutField, string> = {
  openStudyPicker: "Open study picker",
  pauseResume: "Pause / resume",
  finish: "Finish",
  hideShowTimer: "Hide / show timer",
};

function allValues(shortcuts: KeyboardShortcuts): string[] {
  return [
    shortcuts.openStudyPicker,
    shortcuts.pauseResume,
    shortcuts.finish,
    shortcuts.hideShowTimer,
    ...shortcuts.startFavorite,
  ];
}

export function ShortcutsSection({
  initialShortcuts,
}: {
  initialShortcuts: KeyboardShortcuts;
}) {
  const [shortcuts, setShortcuts] = useState(initialShortcuts);
  const [capturingField, setCapturingField] =
    useState<SingleShortcutField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Keeps the global shortcuts context (used for hints elsewhere, e.g. the
  // timer bar's Pause/Finish buttons) in sync as soon as a change is saved.
  const { setShortcuts: setGlobalShortcuts } = useKeyboardShortcuts();

  async function persist(next: KeyboardShortcuts) {
    setSaving(true);
    const result = await updatePreferencesAction({ keyboardShortcuts: next });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGlobalShortcuts(next);
  }

  function handleCapture(field: SingleShortcutField, e: React.KeyboardEvent) {
    e.preventDefault();
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    const key = e.key;
    const others = allValues(shortcuts).filter((v) => v !== shortcuts[field]);
    if (others.includes(key)) {
      setError(`"${key}" is already used by another shortcut.`);
      return;
    }
    setError(null);
    const next = { ...shortcuts, [field]: key };
    setShortcuts(next);
    setCapturingField(null);
    void persist(next);
  }

  async function handleReset() {
    const result = await resetKeyboardShortcutsAction();
    if (result.ok) {
      setShortcuts(result.data.keyboardShortcuts);
      setGlobalShortcuts(result.data.keyboardShortcuts);
      setError(null);
    }
  }

  return (
    <Section title="Keyboard shortcuts">
      {(Object.keys(FIELD_LABELS) as SingleShortcutField[]).map((field) => (
        <div key={field} className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">{FIELD_LABELS[field]}</span>
          <button
            type="button"
            onKeyDown={(e) => {
              if (capturingField === field) handleCapture(field, e);
            }}
            onClick={() => setCapturingField(field)}
            onBlur={() => setCapturingField(null)}
            className={`min-w-16 rounded-md border px-3 py-1.5 text-center font-mono text-sm shadow-[0_2px_0_var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              capturingField === field
                ? "border-primary bg-accent text-primary shadow-none"
                : "border-border bg-card text-foreground hover:bg-muted-bg"
            }`}
          >
            {capturingField === field
              ? "Press a key…"
              : shortcuts[field] === " "
                ? "Space"
                : shortcuts[field]}
          </button>
        </div>
      ))}
      <p className="text-xs text-muted">
        Start favorite study N: {shortcuts.startFavorite.slice(0, 9).join(", ")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleReset}
          disabled={saving}
        >
          Reset to defaults
        </Button>
      </div>
    </Section>
  );
}
