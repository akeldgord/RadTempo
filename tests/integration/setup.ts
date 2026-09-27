import { config } from "dotenv";
import path from "node:path";

// Load .env.test (if present) then fall back to .env for local runs. CI sets
// DATABASE_URL_TEST directly and does not need either file.
config({ path: path.resolve(process.cwd(), ".env.test") });

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
  throw new Error(
    "DATABASE_URL_TEST must be set to run integration tests (see .env.example)",
  );
}

// Point the app's DATABASE_URL at the test database for the duration of the
// integration test run so `src/db` and `better-auth` connect to it.
process.env.DATABASE_URL = databaseUrlTest;
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-secret-test-secret-test-secret";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
