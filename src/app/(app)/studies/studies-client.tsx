"use client";

import { useMemo, useState } from "react";
import { Star, ArrowUp, ArrowDown, Pencil, Trash2, Plus } from "lucide-react";
import {
  countStudyTypeTimingsAction,
  createStudyTypeAction,
  deleteStudyTypeAction,
  reorderStudyTypesAction,
  setFavoriteAction,
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

function groupKey(s: StudyType) {
  return `${s.modality} · ${s.bodyRegion}`;
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

  const groups = useMemo(() => {
    const map = new Map<string, StudyType[]>();
    for (const s of studyTypes) {
      const key = groupKey(s);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [studyTypes]);

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

  async function openDeleteConfirm(s: StudyType) {
    const result = await countStudyTypeTimingsAction(s.id);
    setDeleteTarget({
      id: s.id,
      name: s.name,
      count: result.ok ? result.data : 0,
    });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Studies</h1>
          <p className="text-sm text-muted">
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
                <select
                  id="new-modality"
                  value={form.modality}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modality: e.target.value }))
                  }
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                >
                  <option value="CT">CT</option>
                  <option value="MRI">MRI</option>
                </select>
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

      {groups.map(([key, items]) => (
        <section key={key}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {key}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {items
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => (
                <li key={s.id}>
                  <StudyRow
                    study={s}
                    editing={editingId === s.id}
                    onEdit={() => setEditingId(s.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={(patch) => handleUpdate(s.id, patch)}
                    onToggleFavorite={() => handleToggleFavorite(s)}
                    onMoveUp={() => handleMove(s, -1)}
                    onMoveDown={() => handleMove(s, 1)}
                    onDelete={() => openDeleteConfirm(s)}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this study type and{" "}
              {deleteTarget?.count ?? 0} recorded timing
              {deleteTarget?.count === 1 ? "" : "s"}. This cannot be undone.
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
    </div>
  );
}

function StudyRow({
  study,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onToggleFavorite,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  study: StudyType;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { name: string; shortName: string }) => void;
  onToggleFavorite: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(study.name);
  const [shortName, setShortName] = useState(study.shortName);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
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
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
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
          variant="ghost"
          size="sm"
          aria-label="Delete"
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden="true" className="text-danger" />
        </Button>
      </div>
    </div>
  );
}
