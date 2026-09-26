"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingAction } from "@/features/onboarding/actions";
import {
  listStudyTypesAction,
  setFavoriteAction,
} from "@/features/studies/actions";
import type { StudyTypeTemplate } from "@/features/studies/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type PresetChoice = "defaults" | "customize";

const STEP_TITLES = ["Welcome", "Before you start", "Study types", "Favorites"];

export function OnboardingFlow({
  templates,
}: {
  templates: StudyTypeTemplate[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [presetChoice, setPresetChoice] = useState<PresetChoice>("defaults");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(templates.map((t) => t.id)),
  );
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byModality = new Map<string, Map<string, StudyTypeTemplate[]>>();
    for (const t of templates) {
      let regions = byModality.get(t.modality);
      if (!regions) {
        regions = new Map();
        byModality.set(t.modality, regions);
      }
      let list = regions.get(t.bodyRegion);
      if (!list) {
        list = [];
        regions.set(t.bodyRegion, list);
      }
      list.push(t);
    }
    return [...byModality.entries()].map(([modality, regions]) => ({
      modality,
      regions: [...regions.entries()].map(([bodyRegion, studyTypes]) => ({
        bodyRegion,
        studyTypes,
      })),
    }));
  }, [templates]);

  const chosenTemplates =
    presetChoice === "defaults"
      ? templates
      : templates.filter((t) => selectedIds.has(t.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    const result = await completeOnboardingAction({
      useTemplates: presetChoice === "defaults" || selectedIds.size > 0,
      selectedTemplateIds:
        presetChoice === "customize" ? [...selectedIds] : undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if (favoriteIds.size > 0) {
      const studyTypes = await listStudyTypesAction();
      if (studyTypes.ok) {
        const toFavorite = studyTypes.data.filter(
          (s) =>
            s.createdFromTemplate && favoriteIds.has(s.createdFromTemplate),
        );
        await Promise.all(toFavorite.map((s) => setFavoriteAction(s.id, true)));
      }
    }

    router.push("/");
  }

  const canGoNext =
    step === 2 ? presetChoice === "defaults" || selectedIds.size > 0 : true;

  return (
    <Card>
      <CardContent className="pt-6">
        <ol
          className="mb-6 flex items-center gap-2"
          aria-label="Onboarding steps"
        >
          {STEP_TITLES.map((title, i) => (
            <li key={title} className="flex flex-1 items-center gap-2">
              <span
                aria-current={i === step ? "step" : undefined}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  i <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted-bg text-muted"
                }`}
              >
                {i + 1}
              </span>
              <span className="hidden text-xs text-muted sm:inline">
                {title}
              </span>
              {i < STEP_TITLES.length - 1 && (
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              Welcome to RadTempo
            </h1>
            <p className="text-sm leading-relaxed text-foreground">
              RadTempo measures your own reading pace over time. It does not
              compare you with other radiologists.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Choose a study type, start the timer, read at your own pace, and
              click Finish. Over time RadTempo builds a personal benchmark from
              your own history — never a leaderboard, never a department
              average.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              Before you start
            </h1>
            <div
              role="note"
              className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-foreground"
            >
              <p className="font-medium text-danger">
                Do not enter patient information or other PHI.
              </p>
              <p className="mt-1 text-muted">
                RadTempo never stores case notes, accession numbers, patient
                names or MRNs, report text, or images. Only study type names and
                tag names accept free text — keep them generic (e.g. &ldquo;CT
                Chest +C&rdquo;, &ldquo;Interrupted&rdquo;).
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              Study types
            </h1>
            <p className="text-sm text-muted">
              Start with our CT/MRI body-imaging presets, or pick just the ones
              you read. You can rename, reorder, or add your own later from
              Studies.
            </p>
            <div
              className="flex gap-3"
              role="radiogroup"
              aria-label="Study type presets"
            >
              <button
                type="button"
                role="radio"
                aria-checked={presetChoice === "defaults"}
                onClick={() => setPresetChoice("defaults")}
                className={`flex-1 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  presetChoice === "defaults"
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-foreground hover:bg-muted-bg"
                }`}
              >
                Use defaults
                <span className="mt-1 block text-xs font-normal text-muted">
                  All {templates.length} CT/MRI presets
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={presetChoice === "customize"}
                onClick={() => setPresetChoice("customize")}
                className={`flex-1 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  presetChoice === "customize"
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-foreground hover:bg-muted-bg"
                }`}
              >
                Customize
                <span className="mt-1 block text-xs font-normal text-muted">
                  Choose which presets to start with
                </span>
              </button>
            </div>

            {presetChoice === "customize" && (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border p-3">
                {grouped.map((group) => (
                  <div key={group.modality} className="mb-3">
                    <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      {group.modality}
                    </h2>
                    {group.regions.map((region) => (
                      <div key={region.bodyRegion} className="mb-2">
                        <p className="mb-1 text-xs font-medium text-muted">
                          {region.bodyRegion}
                        </p>
                        <ul className="flex flex-col gap-1">
                          {region.studyTypes.map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`tmpl-${t.id}`}
                                checked={selectedIds.has(t.id)}
                                onCheckedChange={() => toggleSelected(t.id)}
                              />
                              <label
                                htmlFor={`tmpl-${t.id}`}
                                className="cursor-pointer text-sm text-foreground"
                              >
                                {t.name}{" "}
                                <span className="text-muted">
                                  ({t.shortName})
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              Favorites (optional)
            </h1>
            <p className="text-sm text-muted">
              Mark the study types you read most often. Favorites appear first
              on Start for one-click timing. You can change these anytime.
            </p>
            <ul className="max-h-72 overflow-y-auto rounded-md border border-border p-3">
              {chosenTemplates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1">
                  <Checkbox
                    id={`fav-${t.id}`}
                    checked={favoriteIds.has(t.id)}
                    onCheckedChange={() => toggleFavorite(t.id)}
                  />
                  <label
                    htmlFor={`fav-${t.id}`}
                    className="cursor-pointer text-sm text-foreground"
                  >
                    {t.name} <span className="text-muted">({t.shortName})</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canGoNext}
            >
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={submitting}>
              {submitting ? "Starting..." : "Start using RadTempo"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
