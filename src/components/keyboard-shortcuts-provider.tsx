"use client";

import { useCallback, useEffect, useState } from "react";
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

/** Global keyboard shortcuts (per-user configurable). Ignored while typing
 * in inputs or when a modifier key is held. See docs/SPEC.md "Keyboard
 * shortcuts". */
export function KeyboardShortcutsProvider({
  shortcuts,
  favorites,
}: {
  shortcuts: KeyboardShortcuts;
  favorites: StudyType[];
}) {
  const router = useRouter();
  const { timer, pause, resume, finish, hideElapsed, setHideElapsed, start } =
    useTimer();
  const [pickerOpen, setPickerOpen] = useState(false);

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

  return <StudyPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />;
}
