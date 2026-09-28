"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setMaintenanceModeAction } from "@/features/admin/actions";
import type { MigrationStatus } from "@/features/admin/system";
import { Section } from "./section";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function SystemSection({
  appVersion,
  dbConnected,
  migrations,
  dbSizeBytes,
  maintenanceMode,
}: {
  appVersion: string;
  dbConnected: boolean;
  migrations: MigrationStatus;
  dbSizeBytes: number | null;
  maintenanceMode: boolean;
}) {
  const [, formAction, pending] = useActionState(
    setMaintenanceModeAction,
    null,
  );

  return (
    <Section title="System" description="Instance health, at a glance.">
      <div className="flex flex-col gap-2 text-sm text-foreground">
        <p>
          App version: <span className="font-medium">{appVersion}</span>
        </p>
        <p>
          Database connectivity:{" "}
          <span className="font-medium">
            {dbConnected ? "Connected" : "Unreachable"}
          </span>
        </p>
        <p>
          Migrations:{" "}
          <span className="font-medium">
            {migrations.upToDate
              ? "Up to date"
              : `Out of date (${migrations.appliedCount}/${migrations.journalCount} applied)`}
          </span>
        </p>
        <p>
          Database size:{" "}
          <span className="font-medium">{formatBytes(dbSizeBytes)}</span>
        </p>
      </div>
      <form
        action={formAction}
        className="flex items-center gap-3 border-t border-border pt-4"
      >
        <input
          type="hidden"
          name="maintenanceMode"
          value={String(!maintenanceMode)}
        />
        <span className="text-sm text-foreground">
          Maintenance mode is currently{" "}
          <span className="font-medium">{maintenanceMode ? "on" : "off"}</span>.
        </span>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Working..." : maintenanceMode ? "Turn off" : "Turn on"}
        </Button>
      </form>
    </Section>
  );
}
