import { count } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";

/**
 * Whether any user account exists yet. `/setup` is only reachable while this
 * is false; every other page redirects to `/setup` while it is false. Runs a
 * cheap COUNT query; call only from server components / route handlers
 * (needs the Node.js DB driver, not the edge runtime).
 */
export async function hasAnyUsers(): Promise<boolean> {
  const rows = await db.select({ value: count() }).from(userTable);
  return (rows[0]?.value ?? 0) > 0;
}

/**
 * Whether an operator has configured *any* way to create the initial admin:
 * either `SETUP_TOKEN` (for the interactive `/setup` wizard) or the
 * `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` pair (for scripted
 * bootstrap). If neither is set, the instance fails closed: `/setup` shows
 * a message and creation is impossible rather than falling back to an
 * unauthenticated "first user wins" bypass.
 */
export function isSetupConfigured(): boolean {
  const hasSetupToken = Boolean(process.env.SETUP_TOKEN);
  const hasInitialAdmin = Boolean(
    process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD,
  );
  return hasSetupToken || hasInitialAdmin;
}
