"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import {
  applyImportAction,
  previewImportAction,
} from "@/features/import-export/actions";
import type {
  ApplyImportResult,
  ImportPreview,
} from "@/features/import-export/import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function ImportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applyPreferences, setApplyPreferences] = useState(false);
  const [result, setResult] = useState<ApplyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"preview" | "apply" | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setApplyPreferences(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setResult(null);
    setError(null);
    setPreview(null);
    setFile(selected);
    if (!selected) return;

    setLoading("preview");
    const formData = new FormData();
    formData.set("file", selected);
    const previewResult = await previewImportAction(formData);
    setLoading(null);
    if (!previewResult.ok) {
      setError(previewResult.error);
      return;
    }
    setPreview(previewResult.data);
  }

  async function handleImport() {
    if (!file) return;
    setError(null);
    setLoading("apply");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("applyPreferences", applyPreferences ? "true" : "false");
    const applyResult = await applyImportAction(formData);
    setLoading(null);
    if (!applyResult.ok) {
      setError(applyResult.error);
      return;
    }
    setResult(applyResult.data);
    setPreview(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <p className="text-sm text-muted">
          Choose a previous RadTempo export to preview what would be added
          before anything is written. Re-importing the same export never creates
          duplicates.
        </p>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            aria-label="RadTempo export file"
            onChange={handleFileChange}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
          {(file || preview || result) && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
        </div>

        {loading === "preview" && (
          <p role="status" className="text-sm text-muted">
            Checking this file…
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {preview && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <table className="w-full text-sm">
              <caption className="sr-only">Import preview</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-1">
                    Item
                  </th>
                  <th scope="col" className="py-1">
                    New
                  </th>
                  <th scope="col" className="py-1">
                    Already have
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 text-foreground">Study types</td>
                  <td className="py-1 text-foreground">
                    {preview.studyTypes.new}
                  </td>
                  <td className="py-1 text-muted">
                    {preview.studyTypes.matched}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-foreground">Tags</td>
                  <td className="py-1 text-foreground">{preview.tags.new}</td>
                  <td className="py-1 text-muted">{preview.tags.matched}</td>
                </tr>
                <tr>
                  <td className="py-1 text-foreground">Timed cases</td>
                  <td className="py-1 text-foreground">{preview.cases.new}</td>
                  <td className="py-1 text-muted">
                    {preview.cases.duplicate} already imported
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-preferences"
                checked={applyPreferences}
                onCheckedChange={(checked) =>
                  setApplyPreferences(checked === true)
                }
              />
              <Label htmlFor="apply-preferences" className="text-sm">
                Apply preferences too (theme, timer visibility, keyboard
                shortcuts)
              </Label>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={loading === "apply"}
              className="self-start"
            >
              <Upload size={14} aria-hidden="true" />
              {loading === "apply" ? "Importing…" : "Import"}
            </Button>
          </div>
        )}

        {result && (
          <p role="status" className="text-sm text-primary">
            Imported {result.cases.created} case
            {result.cases.created === 1 ? "" : "s"} ({result.cases.skipped}{" "}
            already imported), {result.studyTypes.created} new study type
            {result.studyTypes.created === 1 ? "" : "s"}, and{" "}
            {result.tags.created} new tag{result.tags.created === 1 ? "" : "s"}
            {result.preferencesApplied ? ". Preferences applied." : "."}
          </p>
        )}

        <p className="text-xs text-danger">
          Only import files you exported from your own RadTempo account.
        </p>
      </CardContent>
    </Card>
  );
}
