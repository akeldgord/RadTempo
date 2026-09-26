"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ExportSection() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setDownloading(true);
    try {
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not build your export.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? "radtempo-export.zip";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not build your export. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <p className="text-sm text-muted">
          Download a zip of your study types, tags, timed cases, and
          preferences, plus a spreadsheet-friendly CSV. It never includes your
          password, sessions, or any other secret.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleDownload}
          disabled={downloading}
          className="self-start"
        >
          <Download size={14} aria-hidden="true" />
          {downloading ? "Preparing…" : "Download export"}
        </Button>
      </CardContent>
    </Card>
  );
}
