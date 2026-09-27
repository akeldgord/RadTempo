"use client";

import { useState } from "react";
import { updatePreferencesAction } from "@/features/preferences/actions";
import type { TimerVisibility } from "@/features/preferences/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
    <Card>
      <CardHeader>
        <CardTitle>Timer bar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
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
          These reflect how the timer bar appears next time you load RadTempo.
          You can also change them from the timer bar itself while a study is
          running.
        </p>
      </CardContent>
    </Card>
  );
}
