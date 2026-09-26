"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTimer } from "@/components/timer/timer-context";
import { StudyPickerDialog } from "@/components/study-picker-dialog";
import type { KeyboardShortcuts } from "@/features/preferences/service";
import type { StudyType } from "@/features/studies/service";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** The user's current keyboard shortcuts, shared with any component that
 * needs to display a hint (e.g. the timer bar's Pause/Finish buttons).
 * Kept in sync with the settings page via `setShortcuts` so hints update
 * immediately after a change, without a full page reload. */
const KeyboardShortcutsContext = createContext<{
  shortcuts: KeyboardShortcuts;
  setShortcuts: (shortcuts: KeyboardShortcuts) => void;
} | null>(null);

/** The current user's configured keyboard shortcuts. Must be used within
 * `KeyboardShortcutsProvider` (mounted once, in the app layout). */
export function useKeyboardShortcuts(): {
  shortcuts: KeyboardShortcuts;
  setShortcuts: (shortcuts: KeyboardShortcuts) => void;
} {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useKeyboardShortcuts must be used within KeyboardShortcutsProvider",
    );
  }
  return ctx;
}

/** Global keyboard shortcuts (per-user configurable). Ignored while typing
 * in inputs or when a modifier key is held. Also makes the current
 * shortcuts available to descendants (e.g. for button hints) via
 * `useKeyboardShortcuts`. See docs/SPEC.md "Keyboard shortcuts". */
export function KeyboardShortcutsProvider({
  initialShortcuts,
  favorites,
  children,
}: {
  initialShortcuts: KeyboardShortcuts;
  favorites: StudyType[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { timer, pause, resume, finish, hideElapsed, setHideElapsed, start } =
    useTimer();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(initialShortcuts);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key;

      if (key === shortcuts.openStudyPicker) {
        e.preventDefault();
        setPickerOpen(true);
        return;
      }
      if (key === shortcuts.pauseResume && timer) {
        e.preventDefault();
        if (timer.status === "PAUSED") void resume();
        else void pause();
        return;
      }
      if (key === shortcuts.finish && timer) {
        e.preventDefault();
        void finish();
        return;
      }
      if (key === shortcuts.hideShowTimer) {
        e.preventDefault();
        setHideElapsed(!hideElapsed);
        return;
      }
      const favoriteIndex = shortcuts.startFavorite.indexOf(key);
      if (favoriteIndex !== -1 && !timer) {
        const study = favorites[favoriteIndex];
        if (study) {
          e.preventDefault();
          void start(study.id).then((res) => {
            if (res.ok) router.push("/");
          });
        }
      }
    },
    [
      shortcuts,
      timer,
      pause,
      resume,
      finish,
      hideElapsed,
      setHideElapsed,
      favorites,
      start,
      router,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <KeyboardShortcutsContext.Provider value={{ shortcuts, setShortcuts }}>
      {children}
      <StudyPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </KeyboardShortcutsContext.Provider>
  );
}
