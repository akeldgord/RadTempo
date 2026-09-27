"use client";

import { useState } from "react";
import { updatePreferencesAction } from "@/features/preferences/actions";
import type { TimerVisibility } from "@/features/preferences/service";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Section } from "./section";

export function TimerVisibilitySection({
  initialVisibility,
}: {
  initialVisibility: TimerVisibility;
}) {
  const [minimized, setMinimized] = useState(initialVisibility === "minimized");
  const [hideElapsed, setHideElapsed] = useState(
    initialVisibility === "hidden_time",
  );

  async function save(nextMinimized: boolean, nextHideElapsed: boolean) {
    const visibility: TimerVisibility = nextHideElapsed
      ? "hidden_time"
      : nextMinimized
        ? "minimized"
        : "full";
    await updatePreferencesAction({ timerVisibility: visibility });
  }

  return (
    <Section
      title="Timer bar"
      description="Reflects how the timer bar appears next time you load RadTempo."
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="minimized-switch">Start minimized</Label>
        <Switch
          id="minimized-switch"
          checked={minimized}
          onCheckedChange={(v) => {
            setMinimized(v);
            void save(v, hideElapsed);
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="hide-elapsed-switch">Hide elapsed time</Label>
        <Switch
          id="hide-elapsed-switch"
          checked={hideElapsed}
          onCheckedChange={(v) => {
            setHideElapsed(v);
            void save(minimized, v);
          }}
        />
      </div>
      <p className="text-xs text-muted">
        You can also change these from the timer bar itself while a study is
        running.
      </p>
    </Section>
  );
}
