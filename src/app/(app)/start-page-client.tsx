"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Search } from "lucide-react";
import { useTimer } from "@/components/timer/timer-context";
import type { HomeSections, StudyType } from "@/features/studies/service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function StudyButton({
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
      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted-bg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-medium text-foreground">{study.name}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {study.favorite && (
          <Star
            size={12}
            className="fill-current text-primary"
            aria-hidden="true"
          />
        )}
        {study.shortName}
      </span>
    </button>
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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Start</h1>
        <p className="text-sm text-muted">
          Select a study type to begin a timed read.
        </p>
      </div>

      {timer && (
        <p className="text-sm text-muted">{timer.shortName} — timer running</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search study types..."
          aria-label="Search study types"
          className="pl-9"
        />
      </div>

      {searchResults ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Search results
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.length === 0 && (
              <p className="text-sm text-muted">No matches.</p>
            )}
            {searchResults.map((s) => (
              <StudyButton
                key={s.id}
                study={s}
                disabled={disabled || pendingId === s.id}
                onStart={handleStart}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          {sections.favorites.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Favorites
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sections.favorites.map((s) => (
                  <StudyButton
                    key={s.id}
                    study={s}
                    disabled={disabled || pendingId === s.id}
                    onStart={handleStart}
                  />
                ))}
              </div>
            </section>
          )}

          {sections.frequent.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Frequently used
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sections.frequent.map((s) => (
                  <StudyButton
                    key={s.id}
                    study={s}
                    disabled={disabled || pendingId === s.id}
                    onStart={handleStart}
                  />
                ))}
              </div>
            </section>
          )}

          {sections.recent.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Recent
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sections.recent.map((s) => (
                  <StudyButton
                    key={s.id}
                    study={s}
                    disabled={disabled || pendingId === s.id}
                    onStart={handleStart}
                  />
                ))}
              </div>
            </section>
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
            <div className="flex flex-col gap-4">
              {sections.all.map((modalityGroup) => (
                <details
                  key={modalityGroup.modality}
                  className="rounded-md border border-border"
                  open
                >
                  <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-foreground focus-visible:outline-none">
                    {modalityGroup.modality}
                  </summary>
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    {modalityGroup.regions.map((region) => (
                      <details key={region.bodyRegion} open>
                        <summary className="cursor-pointer py-1 text-xs font-medium uppercase tracking-wide text-muted focus-visible:outline-none">
                          {region.bodyRegion}
                        </summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {region.studyTypes.map((s) => (
                            <StudyButton
                              key={s.id}
                              study={s}
                              disabled={disabled || pendingId === s.id}
                              onStart={handleStart}
                            />
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}

      {timer && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.refresh()}
          className="self-start"
        >
          Refresh
        </Button>
      )}
    </div>
  );
}
