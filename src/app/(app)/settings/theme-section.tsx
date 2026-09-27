"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import { updatePreferencesAction } from "@/features/preferences/actions";
import type { Theme } from "@/features/preferences/service";
import { Section } from "./section";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeSection({ initialTheme }: { initialTheme: Theme }) {
  const { setTheme } = useTheme();
  const [selected, setSelected] = useState<Theme>(initialTheme);

  async function handleSelect(value: Theme) {
    setSelected(value);
    setTheme(value);
    await updatePreferencesAction({ theme: value });
  }

  return (
    <Section title="Theme">
      <div
        className="inline-flex w-fit rounded-md border border-border"
        role="group"
        aria-label="Theme"
      >
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected === value}
            onClick={() => void handleSelect(value)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected === value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted-bg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}
