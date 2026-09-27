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
