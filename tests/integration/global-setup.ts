import { config } from "dotenv";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies all committed migrations to the integration test database once
 * before any test file runs, so a fresh database (e.g. in CI) works.
 */
export default async function setup() {
  config({ path: path.resolve(process.cwd(), ".env.test") });
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_TEST must be set to run integration tests (see .env.example)",
    );
  }

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await client.end();
  }
}
