import fs from "node:fs";
import path from "node:path";
import { sql } from "@/db";

export type MigrationStatus = {
  journalCount: number;
  appliedCount: number;
  upToDate: boolean;
};

export type SystemHealth = {
  appVersion: string;
  databaseConnected: boolean;
  migrations: MigrationStatus;
  databaseSizeBytes: number | null;
  maintenanceMode: boolean;
};

export function getAppVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Compares the committed Drizzle migration journal against the
 * `drizzle.__drizzle_migrations` bookkeeping table Drizzle writes to in the
 * target database. Read-only; never runs migrations.
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const journalPath = path.join(
    process.cwd(),
    "drizzle",
    "meta",
    "_journal.json",
  );
  let journalCount = 0;
  try {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: unknown[];
    };
    journalCount = journal.entries?.length ?? 0;
  } catch {
    journalCount = 0;
  }

  let appliedCount = 0;
  try {
    const rows = await sql`
      select count(*)::int as count
      from drizzle.__drizzle_migrations
    `;
    appliedCount = rows[0]?.count ?? 0;
  } catch {
    // The bookkeeping table/schema doesn't exist yet (e.g. no migrations
    // have ever run against this database).
    appliedCount = 0;
  }

  return {
    journalCount,
    appliedCount,
    upToDate: journalCount === appliedCount,
  };
}

export async function checkDatabaseConnected(): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function getDatabaseSizeBytes(): Promise<number | null> {
  try {
    const rows = await sql`select pg_database_size(current_database()) as size`;
    const size = rows[0]?.size;
    return size == null ? null : Number(size);
  } catch {
    return null;
  }
}
