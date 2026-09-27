"use client";

/**
 * Client-side timer state: holds the server-authoritative `TimerState`,
 * derives elapsed time from a server/client clock offset, resyncs on
 * focus/visibility/online and every 30s, and exposes the mutation actions
 * used by the timer bar and post-case panel. See docs/SPEC.md, sections
 * "Timer" and "Post-case panel".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  classifyEntryAction,
  discardActiveTimerAction,
  finalizeClassificationAction,
  finishTimerAction,
  pauseTimerAction,
  resumeTimerAction,
  startTimerAction,
} from "@/features/timer/actions";
import type {
  CompletedEntrySummary,
  TimerState,
} from "@/features/timer/service";
import type { Complexity } from "@/features/analytics/types";
import { updatePreferencesAction } from "@/features/preferences/actions";
import type { NewlyEarnedAchievement } from "@/features/achievements/service";

export interface PostCasePanelState {
  entry: CompletedEntrySummary;
  feedbackText: string;
  durationText: string;
  newAchievements: NewlyEarnedAchievement[];
}

interface TimerContextValue {
  timer: TimerState | null;
  elapsedMs: number;
  loading: boolean;
  offline: boolean;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  hideElapsed: boolean;
  setHideElapsed: (v: boolean) => void;
  start: (studyTypeId: string) => Promise<{ ok: boolean; error?: string }>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<{ ok: boolean; error?: string }>;
  discard: () => Promise<void>;
  panel: PostCasePanelState | null;
  closePanel: () => void;
  setPanelComplexity: (c: Complexity) => Promise<void>;
  setPanelTags: (tagIds: string[]) => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

function toClientTimer(t: TimerState | null): TimerState | null {
  if (!t) return null;
  return {
    ...t,
    startedAt: new Date(t.startedAt),
    pauseStartedAt: t.pauseStartedAt ? new Date(t.pauseStartedAt) : null,
    serverNow: new Date(t.serverNow),
  };
}

export function TimerProvider({
  initialTimer,
  initialTimerVisibility,
  children,
}: {
  initialTimer: TimerState | null;
  initialTimerVisibility: "full" | "minimized" | "hidden_time";
  children: React.ReactNode;
}) {
  const [timer, setTimer] = useState<TimerState | null>(
    toClientTimer(initialTimer),
  );
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(() =>
    initialTimer ? new Date(initialTimer.serverNow).getTime() - Date.now() : 0,
  );
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [minimized, setMinimized] = useState(
    initialTimerVisibility === "minimized",
  );
  const [hideElapsed, setHideElapsed] = useState(
    initialTimerVisibility === "hidden_time",
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [panel, setPanel] = useState<PostCasePanelState | null>(null);
  const timerRef = useRef(timer);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  const visibilityMounted = useRef(false);

  // Display-only 1s tick. Never used for correctness — the server clock
  // offset is what makes elapsed time authoritative.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const resync = useCallback(async () => {
    try {
      const res = await fetch("/api/timer", { cache: "no-store" });
      if (!res.ok) throw new Error("resync failed");
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "resync failed");
      const next: TimerState | null = body.data;
      setTimer(toClientTimer(next));
      if (next) {
        setClockOffsetMs(new Date(next.serverNow).getTime() - Date.now());
      }
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    function onFocus() {
      void resync();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") void resync();
    }
    function onOnline() {
      void resync();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const id = setInterval(() => void resync(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(id);
    };
  }, [resync]);

  // Persist minimize / hide-elapsed toggles to user_preferences.timer_visibility.
  useEffect(() => {
    if (!visibilityMounted.current) {
      visibilityMounted.current = true;
      return;
    }
    const timerVisibility = hideElapsed
      ? "hidden_time"
      : minimized
        ? "minimized"
        : "full";
    void updatePreferencesAction({ timerVisibility });
  }, [minimized, hideElapsed]);

  const elapsedMs = useMemo(() => {
    if (!timer) return 0;
    const effectiveNowMs =
      timer.status === "PAUSED" && timer.pauseStartedAt
        ? timer.pauseStartedAt.getTime()
        : nowTick + clockOffsetMs;
    return Math.max(
      0,
      effectiveNowMs - timer.startedAt.getTime() - timer.pausedDurationMs,
    );
  }, [timer, nowTick, clockOffsetMs]);

  const start = useCallback(async (studyTypeId: string) => {
    setLoading(true);
    const result = await startTimerAction(studyTypeId);
    setLoading(false);
    if (!result.ok) return { ok: false, error: result.error };
    setTimer(toClientTimer(result.data));
    setClockOffsetMs(new Date(result.data.serverNow).getTime() - Date.now());
    setPanel(null);
    return { ok: true };
  }, []);

  const pause = useCallback(async () => {
    if (!timerRef.current) return;
    const id = timerRef.current.id;
    const result = await pauseTimerAction(id);
    if (result.ok) setTimer(toClientTimer(result.data));
  }, []);

  const resume = useCallback(async () => {
    if (!timerRef.current) return;
    const id = timerRef.current.id;
    const result = await resumeTimerAction(id);
    if (result.ok) setTimer(toClientTimer(result.data));
  }, []);

  const finish = useCallback(async () => {
    if (!timerRef.current) return { ok: false, error: "No active timer" };
    const id = timerRef.current.id;
    const result = await finishTimerAction(id);
    if (!result.ok) return { ok: false, error: result.error };
    setTimer(null);
    setPanel({
      entry: result.data.entry,
      feedbackText: result.data.feedbackText,
      durationText: result.data.durationText,
      newAchievements: result.data.newAchievements,
    });
    return { ok: true };
  }, []);

  const discard = useCallback(async () => {
    if (!timerRef.current) return;
    const id = timerRef.current.id;
    const result = await discardActiveTimerAction(id);
    if (result.ok) setTimer(null);
  }, []);

  const closePanel = useCallback(() => {
    setPanel((p) => {
      if (p) void finalizeClassificationAction(p.entry.id);
      return null;
    });
  }, []);

  const setPanelComplexity = useCallback(
    async (complexity: Complexity) => {
      setPanel((p) => (p ? { ...p, entry: { ...p.entry, complexity } } : p));
      const current = panel;
      if (!current) return;
      const result = await classifyEntryAction(current.entry.id, {
        complexity,
      });
      if (result.ok) {
        setPanel((p) =>
          p
            ? {
                ...p,
                entry: result.data.entry,
                feedbackText: result.data.feedbackText,
              }
            : p,
        );
      } else {
        // Immutable/expired: hide the panel gracefully.
        setPanel(null);
      }
    },
    [panel],
  );

  const setPanelTags = useCallback(
    async (tagIds: string[]) => {
      const current = panel;
      if (!current) return;
      setPanel((p) => (p ? { ...p, entry: { ...p.entry, tagIds } } : p));
      const result = await classifyEntryAction(current.entry.id, { tagIds });
      if (result.ok) {
        setPanel((p) =>
          p
            ? {
                ...p,
                entry: result.data.entry,
                feedbackText: result.data.feedbackText,
              }
            : p,
        );
      } else {
        setPanel(null);
      }
    },
    [panel],
  );

  const value: TimerContextValue = {
    timer,
    elapsedMs,
    loading,
    offline,
    minimized,
    setMinimized,
    hideElapsed,
    setHideElapsed,
    start,
    pause,
    resume,
    finish,
    discard,
    panel,
    closePanel,
    setPanelComplexity,
    setPanelTags,
  };

  return (
    <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}
