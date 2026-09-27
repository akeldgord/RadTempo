"use client";

import { useCallback, useRef } from "react";

/**
 * Radix's Dialog/AlertDialog only restores focus to the element that had
 * it before opening automatically when it owns the trigger itself (i.e.
 * `<Dialog.Trigger>`/`<AlertDialog.Trigger>`). A dialog whose `open` state
 * is instead driven externally — because more than one element can open
 * it (e.g. History's desktop and mobile delete buttons for the same row),
 * or because opening needs an async check first (e.g. Studies' archive-
 * vs-delete decision) — gets no such restoration on its own, and focus
 * falls back to `<body>` when the dialog closes (via Escape, Cancel, or
 * any other path). See DESIGN_NOTES.md "R3 verification".
 *
 * Call `capture()` synchronously at the very top of whatever opens the
 * dialog (before any `await`), and pass `restoreFocus` as the dialog
 * Content's `onCloseAutoFocus`.
 */
export function useDialogFocusReturn() {
  const triggerRef = useRef<HTMLElement | null>(null);

  const capture = useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const restoreFocus = useCallback((event: Event) => {
    const el = triggerRef.current;
    if (el && document.contains(el)) {
      event.preventDefault();
      el.focus();
    }
  }, []);

  return { capture, restoreFocus };
}
