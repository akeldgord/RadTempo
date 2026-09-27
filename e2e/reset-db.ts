import postgres from "postgres";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Resets the dedicated e2e database and applies migrations. Run as a
 * pretest step (see package.json's `e2e` script) rather than as Playwright
 * `globalSetup`, so it completes — and the schema fully exists — strictly
 * before Playwright starts `webServer` (`pnpm build && pnpm start`), which
 * connects to the same database immediately on boot.
 */
async function main() {
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://radtempo:radtempo@localhost:5432/radtempo_e2e";

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    // Drizzle's migration-tracking table lives in its own "drizzle" schema,
    // separate from the app's "public" schema. Dropping only "public" would
    // leave __drizzle_migrations believing every migration already ran,
    // so the migrator would skip recreating any tables. Drop both.
    await sql`DROP SCHEMA IF EXISTS public CASCADE`;
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    await sql`CREATE SCHEMA public`;
  } finally {
    await sql.end();
  }

  execSync("pnpm db:migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  // A cached admin session (see e2e/helpers.ts's cacheAdminSession) from a
  // previous run points at a session row that no longer exists after the
  // reset above — drop it so this run re-authenticates and re-caches.
  rmSync(path.join(__dirname, ".auth"), { recursive: true, force: true });
}

main().catch((error) => {
  console.error("e2e DB reset failed:", error);
  process.exit(1);
});
