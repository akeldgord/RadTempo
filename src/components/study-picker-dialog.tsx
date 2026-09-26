"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listStudyTypesAction } from "@/features/studies/actions";
import type { StudyType } from "@/features/studies/service";
import { useTimer } from "@/components/timer/timer-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Command-style study picker, opened via the keyboard shortcut ("/" by
 * default) or the Start page's search. One click/Enter starts the timer. */
export function StudyPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { timer, start } = useTimer();
  const [studyTypes, setStudyTypes] = useState<StudyType[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setQuery("");
      setError(null);
      void listStudyTypesAction().then((res) => {
        if (res.ok) setStudyTypes(res.data);
      });
    }, 0);
    return () => clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return studyTypes;
    return studyTypes.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q),
    );
  }, [studyTypes, query]);

  async function handleSelect(studyTypeId: string) {
    if (timer) {
      onOpenChange(false);
      return;
    }
    const result = await start(studyTypeId);
    if (!result.ok) {
      setError(result.error ?? "Could not start the timer.");
      return;
    }
    onOpenChange(false);
    router.push("/");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-24 max-h-[70vh] -translate-y-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Start a study</DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-3">
          <Input
            autoFocus
            placeholder="Search study types..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search study types"
          />
        </div>
        {timer && (
          <p className="px-4 text-sm text-muted">
            A timer is already running for {timer.shortName}. Finish or discard
            it before starting another.
          </p>
        )}
        {error && (
          <p role="alert" className="px-4 text-sm text-danger">
            {error}
          </p>
        )}
        <ul className="max-h-80 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted">No matches.</li>
          )}
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!!timer}
                onClick={() => void handleSelect(s.id)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span>{s.name}</span>
                <span className="text-xs text-muted">{s.shortName}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
