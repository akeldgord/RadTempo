import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";

/** Creates a bare USER row directly (no Better Auth account/session needed —
 * these tests exercise the feature services directly with an explicit
 * userId, the same way a server action does after `requireUser()`). */
export async function createTestUser(email?: string): Promise<string> {
  const id = randomUUID();
  await db.insert(userTable).values({
    id,
    email: email ?? `${id}@example.com`,
    name: "Test User",
  });
  return id;
}
