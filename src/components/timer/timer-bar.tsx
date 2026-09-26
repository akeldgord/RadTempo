"use client";

import { useState } from "react";
import {
  Pause,
  Play,
  Square,
  MoreHorizontal,
  ChevronUp,
  EyeOff,
  Eye,
} from "lucide-react";
import { useTimer } from "./timer-context";
import { formatDuration } from "@/features/analytics/engine";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PostCasePanel } from "./post-case-panel";

/** Small, quiet, always-visible timer bar. No countdown, no red, no
 * "behind" warnings — see docs/SPEC.md "Timer". */
export function TimerBar() {
  const {
    timer,
    elapsedMs,
    offline,
    minimized,
    setMinimized,
    hideElapsed,
    setHideElapsed,
    pause,
    resume,
    finish,
    discard,
    panel,
  } = useTimer();
  const [finishError, setFinishError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  if (!timer && !panel) return null;

  if (!timer && panel) {
    return (
      <div className="sticky top-0 z-30 border-b border-border bg-card px-4 py-3 sm:px-6">
        <PostCasePanel />
      </div>
    );
  }

  if (!timer) return null;

  async function handlePauseResume() {
    if (!timer) return;
    setBusy(true);
    if (timer.status === "PAUSED") await resume();
    else await pause();
    setBusy(false);
  }

  async function handleFinish() {
    setBusy(true);
    setFinishError(null);
    const result = await finish();
    setBusy(false);
    if (!result.ok) {
      setFinishError(result.error ?? "Could not save. Retry.");
    }
  }

  if (minimized) {
    return (
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-1.5 text-sm sm:px-6">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Expand timer"
          title="Expand timer"
        >
          <ChevronUp size={14} aria-hidden="true" />
          <span className="font-medium text-foreground">{timer.shortName}</span>
          {!hideElapsed && (
            <span className="font-mono tabular-nums text-muted">
              {formatDuration(elapsedMs)}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {timer.shortName}
            </span>
            {timer.status === "PAUSED" && (
              <span className="text-xs text-muted">Paused</span>
            )}
          </div>
          {!hideElapsed ? (
            <span
              data-testid="timer-elapsed"
              className="font-mono text-lg tabular-nums text-foreground"
              aria-live="off"
            >
              {formatDuration(elapsedMs)}
            </span>
          ) : (
            <span className="text-xs text-muted">Elapsed time hidden</span>
          )}
          {offline && (
            <span className="text-xs text-muted">offline — will resync</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handlePauseResume}
            disabled={busy}
            aria-keyshortcuts="p"
            title="Pause/Resume (p)"
          >
            {timer.status === "PAUSED" ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
            {timer.status === "PAUSED" ? "Resume" : "Pause"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleFinish}
            disabled={busy}
            aria-keyshortcuts="f"
            title="Finish (f)"
          >
            <Square size={14} aria-hidden="true" />
            Finish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="More timer actions"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setMinimized(true)}>
                Minimize
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHideElapsed(!hideElapsed)}>
                {hideElapsed ? (
                  <>
                    <Eye size={14} aria-hidden="true" /> Show elapsed time
                  </>
                ) : (
                  <>
                    <EyeOff size={14} aria-hidden="true" /> Hide elapsed time
                  </>
                )}
              </DropdownMenuItem>
              <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setDiscardOpen(true);
                    }}
                    className="text-danger"
                  >
                    Discard
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard this timer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This case will not be saved to your history. This cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="danger"
                      onClick={() => void discard()}
                    >
                      Discard
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {finishError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {finishError} Your timer is still recoverable.
        </p>
      )}
    </div>
  );
}
