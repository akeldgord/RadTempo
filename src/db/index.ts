import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

// A single shared connection pool for the process. Next.js dev mode may
// reload this module, so we stash the client on globalThis to avoid
// exhausting connections.
const globalForDb = globalThis as unknown as {
  __radtempoSql?: postgres.Sql;
};

const sql = globalForDb.__radtempoSql ?? postgres(databaseUrl, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__radtempoSql = sql;
}

export const db = drizzle(sql, { schema });
export { sql };
