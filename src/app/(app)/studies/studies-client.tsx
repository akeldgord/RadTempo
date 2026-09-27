"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Star,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Plus,
  ChevronDown,
} from "lucide-react";
import {
  archiveStudyTypeAction,
  countStudyTypeTimingsAction,
  createStudyTypeAction,
  deleteStudyTypeAction,
  reorderStudyTypesAction,
  setFavoriteAction,
  unarchiveStudyTypeAction,
  updateStudyTypeAction,
} from "@/features/studies/actions";
import type { StudyType } from "@/features/studies/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Suggestions offered on the custom-modality input; any trimmed text
 * 1-40 chars is accepted (see docs/SPEC.md "Study types"). */
const MODALITY_SUGGESTIONS = [
  "CT",
  "MRI",
  "US",
  "XR",
  "PET/CT",
  "NM",
  "Fluoro",
];

/** Hierarchical grouping: modality, then body region within it. */
function groupByModality(items: StudyType[]) {
  const byModality = new Map<string, Map<string, StudyType[]>>();
  for (const s of items) {
    const regions =
      byModality.get(s.modality) ?? new Map<string, StudyType[]>();
    const list = regions.get(s.bodyRegion) ?? [];
    list.push(s);
    regions.set(s.bodyRegion, list);
    byModality.set(s.modality, regions);
  }
  return [...byModality.entries()].map(
    ([modality, regions]) => [modality, [...regions.entries()]] as const,
  );
}

export function StudiesClient({
  initialStudyTypes,
}: {
  initialStudyTypes: StudyType[];
}) {
  const [studyTypes, setStudyTypes] = useState(initialStudyTypes);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    modality: "CT",
    bodyRegion: "",
    name: "",
    shortName: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  /** timing counts per study type id, fetched to decide whether a row's
   * action button reads "Archive" (has timings) or "Delete" (none). */
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const missing = studyTypes.map((s) => s.id).filter((id) => !(id in counts));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (id) => {
        const result = await countStudyTypeTimingsAction(id);
        return [id, result.ok ? result.data : 0] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCounts((prev) => {
        const next = { ...prev };
        for (const [id, count] of entries) next[id] = count;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyTypes]);

  const activeStudyTypes = useMemo(
    () => studyTypes.filter((s) => s.archivedAt == null),
    [studyTypes],
  );
  const archivedStudyTypes = useMemo(
    () => studyTypes.filter((s) => s.archivedAt != null),
    [studyTypes],
  );

  const groups = useMemo(
    () => groupByModality(activeStudyTypes),
    [activeStudyTypes],
  );

  function resetForm() {
    setForm({ modality: "CT", bodyRegion: "", name: "", shortName: "" });
  }

  async function handleCreate() {
    setError(null);
    const result = await createStudyTypeAction(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStudyTypes((prev) => [...prev, result.data]);
    setCounts((prev) => ({ ...prev, [result.data.id]: 0 }));
    setCreating(false);
    resetForm();
  }

  async function handleUpdate(id: string, patch: Partial<StudyType>) {
    setError(null);
    const result = await updateStudyTypeAction(id, patch);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStudyTypes((prev) => prev.map((s) => (s.id === id ? result.data : s)));
    setEditingId(null);
  }

  async function handleToggleFavorite(s: StudyType) {
    const result = await setFavoriteAction(s.id, !s.favorite);
    if (result.ok) {
      setStudyTypes((prev) =>
        prev.map((st) => (st.id === s.id ? result.data : st)),
      );
    }
  }

  async function handleMove(s: StudyType, direction: -1 | 1) {
    const sorted = [...studyTypes].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((st) => st.id === s.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const orderedIds = reordered.map((st) => st.id);
    setStudyTypes(reordered.map((st, i) => ({ ...st, sortOrder: i })));
    await reorderStudyTypesAction(orderedIds);
  }

  /** Studies with recorded cases are archived, not deleted, so history and
   * analytics are kept; only a study with zero timings can be deleted. */
  async function openArchiveOrDeleteConfirm(s: StudyType) {
    const result = await countStudyTypeTimingsAction(s.id);
    const count = result.ok ? result.data : 0;
    if (count > 0) {
      setArchiveTarget({ id: s.id, name: s.name, count });
    } else {
      setDeleteTarget({ id: s.id, name: s.name, count });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteStudyTypeAction(deleteTarget.id);
    if (result.ok) {
      setStudyTypes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } else {
      setError(result.error);
    }
    setDeleteTarget(null);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    const result = await archiveStudyTypeAction(archiveTarget.id);
    if (result.ok) {
      setStudyTypes((prev) =>
        prev.map((s) => (s.id === archiveTarget.id ? result.data : s)),
      );
    } else {
      setError(result.error);
    }
    setArchiveTarget(null);
  }

  async function handleUnarchive(s: StudyType) {
    const result = await unarchiveStudyTypeAction(s.id);
    if (result.ok) {
      setStudyTypes((prev) =>
        prev.map((st) => (st.id === s.id ? result.data : st)),
      );
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Studies
          </h1>
          <p className="mt-1 text-sm text-muted">
            Rename, reorder, favorite, or add your own study types.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden="true" /> New study type
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-modality">Modality</Label>
                <Input
                  id="new-modality"
                  list="modality-suggestions"
                  value={form.modality}
                  maxLength={40}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modality: e.target.value }))
                  }
                  placeholder="CT, MRI, US, …"
                />
                <datalist id="modality-suggestions">
                  {MODALITY_SUGGESTIONS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-region">Body region</Label>
                <Input
                  id="new-region"
                  value={form.bodyRegion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bodyRegion: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-name">Name</Label>
                <Input
                  id="new-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-short">Short name</Label>
                <Input
                  id="new-short"
                  value={form.shortName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shortName: e.target.value }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-danger">
              Do not enter patient information or other PHI.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreate}>
                Create
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {groups.map(([modality, regions]) => (
        <section key={modality} className="border-t border-border pt-5">
          <h2 className="mb-3 text-base font-semibold text-foreground">
            {modality}
          </h2>
          <div className="flex flex-col gap-4 pl-0 sm:pl-4">
            {regions.map(([region, items]) => (
              <div key={region}>
                <h3 className="mb-1.5 text-xs font-medium text-muted">
                  {region}
                </h3>
                <ul className="flex flex-col divide-y divide-border border-y border-border">
                  {items
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((s) => (
                      <li key={s.id}>
                        <StudyRow
                          study={s}
                          hasTimings={(counts[s.id] ?? 0) > 0}
                          editing={editingId === s.id}
                          onEdit={() => setEditingId(s.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSave={(patch) => handleUpdate(s.id, patch)}
                          onToggleFavorite={() => handleToggleFavorite(s)}
                          onMoveUp={() => handleMove(s, -1)}
                          onMoveDown={() => handleMove(s, 1)}
                          onArchiveOrDelete={() =>
                            openArchiveOrDeleteConfirm(s)
                          }
                        />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}

      {archivedStudyTypes.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            aria-expanded={archivedOpen}
            className="mb-2 flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform ${archivedOpen ? "" : "-rotate-90"}`}
            />
            Archived ({archivedStudyTypes.length})
          </button>
          {archivedOpen && (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {archivedStudyTypes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 px-1 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {s.name}
                    </p>
                    <p className="text-xs text-muted">{s.shortName}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleUnarchive(s)}
                  >
                    <ArchiveRestore size={14} aria-hidden="true" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This study type has no recorded timings. Deleting it cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This study type has {archiveTarget?.count ?? 0} recorded timing
              {archiveTarget?.count === 1 ? "" : "s"}, so it can&apos;t be
              deleted. Hidden from Start; history and analytics are kept. You
              can restore it later from the Archived section below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger-outline" onClick={handleArchive}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudyRow({
  study,
  hasTimings,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onToggleFavorite,
  onMoveUp,
  onMoveDown,
  onArchiveOrDelete,
}: {
  study: StudyType;
  hasTimings: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { name: string; shortName: string }) => void;
  onToggleFavorite: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onArchiveOrDelete: () => void;
}) {
  const [name, setName] = useState(study.name);
  const [shortName, setShortName] = useState(study.shortName);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-muted-bg px-1 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-56"
          aria-label="Study name"
        />
        <Input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          className="w-32"
          aria-label="Short name"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => onSave({ name, shortName })}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancelEdit}
        >
          Cancel
        </Button>
        <p className="w-full text-xs text-danger">
          Do not enter patient information or other PHI.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2.5 transition-colors hover:bg-muted-bg">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={study.favorite}
          aria-label={study.favorite ? "Remove favorite" : "Mark favorite"}
          onClick={onToggleFavorite}
          className="text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <Star
            size={16}
            className={study.favorite ? "fill-current text-primary" : ""}
            aria-hidden="true"
          />
        </button>
        <div>
          <p className="text-sm font-medium text-foreground">{study.name}</p>
          <p className="text-xs text-muted">{study.shortName}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Move up"
          onClick={onMoveUp}
        >
          <ArrowUp size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Move down"
          onClick={onMoveDown}
        >
          <ArrowDown size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Rename"
          onClick={onEdit}
        >
          <Pencil size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={hasTimings ? "danger-outline" : "danger"}
          size="sm"
          title={
            hasTimings
              ? "Hidden from Start; history and analytics are kept"
              : undefined
          }
          aria-label={hasTimings ? "Archive" : "Delete"}
          onClick={onArchiveOrDelete}
        >
          {hasTimings ? (
            <Archive size={14} aria-hidden="true" />
          ) : (
            <Trash2 size={14} aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
