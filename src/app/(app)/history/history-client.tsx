"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteEntryAction, listHistoryAction } from "@/features/timer/actions";
import type { HistoryRow } from "@/features/timer/service";
import type { StudyType } from "@/features/studies/service";
import type { Tag } from "@/features/tags/service";
import { formatDuration } from "@/features/analytics/engine";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Duration } from "@/components/duration";
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

const PAGE_SIZE = 25;

function complexityLabel(c: string) {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

export function HistoryClient({
  studyTypes,
  tags,
}: {
  studyTypes: StudyType[];
  tags: Tag[];
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);
  const [filters, setFilters] = useState<{
    studyTypeId: string;
    from: string;
    to: string;
    complexity: string;
    included: string;
    tagId: string;
  }>({
    studyTypeId: "",
    from: "",
    to: "",
    complexity: "",
    included: "",
    tagId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listHistoryAction({
      limit: PAGE_SIZE + 1,
      offset: page * PAGE_SIZE,
      studyTypeId: filters.studyTypeId || undefined,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      complexity: filters.complexity || undefined,
      included:
        filters.included === "" ? undefined : filters.included === "yes",
      tagId: filters.tagId || undefined,
    });
    setLoading(false);
    if (result.ok) {
      setHasMore(result.data.length > PAGE_SIZE);
      setRows(result.data.slice(0, PAGE_SIZE));
    }
  }, [page, filters]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  function updateFilter<K extends keyof typeof filters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  function clearFilters() {
    setFilters({
      studyTypeId: "",
      from: "",
      to: "",
      complexity: "",
      included: "",
      tagId: "",
    });
    setPage(0);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteEntryAction(deleteTarget.id);
    if (result.ok) {
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="History" subtitle="Your completed reads." />

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Study"
          value={filters.studyTypeId}
          onChange={(v) => updateFilter("studyTypeId", v)}
          options={[
            { value: "", label: "All studies" },
            ...studyTypes.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <FilterSelect
          label="Complexity"
          value={filters.complexity}
          onChange={(v) => updateFilter("complexity", v)}
          options={[
            { value: "", label: "Any" },
            { value: "EASY", label: "Easy" },
            { value: "TYPICAL", label: "Typical" },
            { value: "DIFFICULT", label: "Difficult" },
          ]}
        />
        <FilterSelect
          label="Included in benchmark"
          value={filters.included}
          onChange={(v) => updateFilter("included", v)}
          options={[
            { value: "", label: "Any" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
        <FilterSelect
          label="Tag"
          value={filters.tagId}
          onChange={(v) => updateFilter("tagId", v)}
          options={[
            { value: "", label: "Any" },
            ...tags.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="from">
            From
          </label>
          <input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="h-9 rounded-md border border-input-border bg-card px-2 text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted" htmlFor="to">
            To
          </label>
          <input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="h-9 rounded-md border border-input-border bg-card px-2 text-sm text-foreground"
          />
        </div>
      </div>

      {loading && (
        <p className="py-6 text-center text-sm text-muted">Loading...</p>
      )}
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted">
            {hasActiveFilters
              ? "No cases match these filters."
              : "No completed reads yet."}
          </p>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/">Start a case</Link>
            </Button>
          )}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Desktop / tablet: dense table, scrolls within its own container. */}
          <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Your completed reads</caption>
              <thead className="border-b border-border bg-muted-bg text-left text-xs font-medium text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Study
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Duration
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Complexity
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Tags
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Included?
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-foreground">
                      {new Date(row.finishedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {row.studyName}
                    </td>
                    <td className="px-3 py-2">
                      <Duration className="text-foreground">
                        {formatDuration(row.activeDurationMs)}
                      </Duration>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {complexityLabel(row.complexity)}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {row.tagIds
                        .map((id) => tags.find((t) => t.id === id)?.name)
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {row.included ? "Yes" : "No"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete case from ${new Date(row.finishedAt).toLocaleString()}`}
                        onClick={() => setDeleteTarget(row)}
                      >
                        <Trash2
                          size={14}
                          className="text-danger"
                          aria-hidden="true"
                        />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked rows instead of a horizontally-scrolling table. */}
          <ul className="flex flex-col rounded-md border border-border sm:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 border-b border-border p-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {row.studyName}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(row.finishedAt).toLocaleString()}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Duration className="text-sm text-foreground">
                      {formatDuration(row.activeDurationMs)}
                    </Duration>
                    <span className="text-xs text-muted">
                      {complexityLabel(row.complexity)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {row.tagIds
                      .map((id) => tags.find((t) => t.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "No tags"}
                  </p>
                  <p className="text-xs text-muted">
                    {row.included ? "Included" : "Excluded"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete case from ${new Date(row.finishedAt).toLocaleString()}`}
                  onClick={() => setDeleteTarget(row)}
                >
                  <Trash2
                    size={14}
                    className="text-danger"
                    aria-hidden="true"
                  />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <span className="text-xs text-muted">Page {page + 1}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case?</AlertDialogTitle>
            <AlertDialogDescription>
              This case will be permanently removed from your history and
              excluded from your analytics. This cannot be undone.
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 rounded-md border border-input-border bg-card px-2 text-sm text-foreground sm:w-36"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
