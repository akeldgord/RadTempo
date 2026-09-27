"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useTimer } from "@/components/timer/timer-context";
import type { HomeSections, StudyType } from "@/features/studies/service";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Viewport, ViewportGrid } from "@/components/viewport";
import { cn } from "@/lib/utils";

/** A large one-click hanging-protocol tile for a favorite study type: the
 * name top-left, the short code bottom-right, the way a DICOM viewport
 * corner-annotates its series. */
function FavoriteTile({
  study,
  disabled,
  onStart,
}: {
  study: StudyType;
  disabled: boolean;
  onStart: (id: string) => void;
}) {
  return (
    <Viewport
      compact
      className="min-w-36 flex-1 basis-36 cursor-pointer text-left transition-colors hover:bg-muted-bg disabled:cursor-not-allowed"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && onStart(study.id)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStart(study.id);
        }
      }}
      topLeft={study.name}
      bottomRight={
        <span className="text-xs text-muted">{study.shortName}</span>
      }
    />
  );
}

/** A quieter list row for frequent/recent studies — one line, no card
 * chrome, the short code trailing the name. */
function StudyRow({
  study,
  disabled,
  onStart,
}: {
  study: StudyType;
  disabled: boolean;
  onStart: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onStart(study.id)}
      className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm font-medium text-foreground">{study.name}</span>
      <span className="shrink-0 text-xs text-muted">{study.shortName}</span>
    </button>
  );
}

function StudyRowList({
  studies,
  disabled,
  pendingId,
  onStart,
}: {
  studies: StudyType[];
  disabled: boolean;
  pendingId: string | null;
  onStart: (id: string) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {studies.map((s) => (
        <StudyRow
          key={s.id}
          study={s}
          disabled={disabled || pendingId === s.id}
          onStart={onStart}
        />
      ))}
    </div>
  );
}

export function StartPageClient({ sections }: { sections: HomeSections }) {
  const router = useRouter();
  const { timer, start } = useTimer();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const allStudies = useMemo(
    () => sections.all.flatMap((m) => m.regions.flatMap((r) => r.studyTypes)),
    [sections],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allStudies.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.shortName.toLowerCase().includes(q),
    );
  }, [query, allStudies]);

  async function handleStart(studyTypeId: string) {
    if (timer) return;
    setError(null);
    setPendingId(studyTypeId);
    const result = await start(studyTypeId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error ?? "Could not start the timer.");
      return;
    }
    router.refresh();
  }

  const disabled = !!timer;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Start"
        subtitle="Select a study type to begin a timed read."
      />

      {timer && (
        <p className="text-sm text-muted">Timer running — {timer.shortName}</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="relative max-w-lg">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search study types..."
          aria-label="Search study types"
          className="h-12 rounded-lg pl-11 text-md"
        />
      </div>

      {searchResults ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Search results
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted">No matches.</p>
          ) : (
            <ViewportGrid fitContent>
              {searchResults.map((s) => (
                <FavoriteTile
                  key={s.id}
                  study={s}
                  disabled={disabled || pendingId === s.id}
                  onStart={handleStart}
                />
              ))}
            </ViewportGrid>
          )}
        </section>
      ) : (
        <>
          {sections.favorites.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Favorites
              </h2>
              <ViewportGrid fitContent>
                {sections.favorites.map((s) => (
                  <FavoriteTile
                    key={s.id}
                    study={s}
                    disabled={disabled || pendingId === s.id}
                    onStart={handleStart}
                  />
                ))}
              </ViewportGrid>
            </section>
          )}

          {(sections.frequent.length > 0 || sections.recent.length > 0) && (
            <div className="grid gap-8 sm:grid-cols-2">
              {sections.frequent.length > 0 && (
                <section>
                  <h2 className="mb-1 text-sm font-semibold text-foreground">
                    Frequently used
                  </h2>
                  <StudyRowList
                    studies={sections.frequent}
                    disabled={disabled}
                    pendingId={pendingId}
                    onStart={handleStart}
                  />
                </section>
              )}

              {sections.recent.length > 0 && (
                <section>
                  <h2 className="mb-1 text-sm font-semibold text-foreground">
                    Recent
                  </h2>
                  <StudyRowList
                    studies={sections.recent}
                    disabled={disabled}
                    pendingId={pendingId}
                    onStart={handleStart}
                  />
                </section>
              )}
            </div>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Browse
            </h2>
            {sections.all.length === 0 && (
              <p className="text-sm text-muted">
                No study types yet.{" "}
                <a href="/studies" className="text-primary underline">
                  Add one in Studies
                </a>
                .
              </p>
            )}
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {sections.all.map((modalityGroup) => (
                <details
                  key={modalityGroup.modality}
                  className="group px-4 py-1 open:pb-3"
                >
                  <summary className="cursor-pointer list-none py-2 text-sm font-semibold text-foreground focus-visible:outline-none">
                    {modalityGroup.modality}
                  </summary>
                  <div className="flex flex-col gap-3 pt-1">
                    {modalityGroup.regions.map((region) => (
                      <div key={region.bodyRegion}>
                        <p className="py-1 text-xs font-medium text-muted">
                          {region.bodyRegion}
                        </p>
                        <div
                          className={cn(
                            "flex flex-col divide-y divide-border pl-2",
                          )}
                        >
                          {region.studyTypes.map((s) => (
                            <StudyRow
                              key={s.id}
                              study={s}
                              disabled={disabled || pendingId === s.id}
                              onStart={handleStart}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
