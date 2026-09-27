import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type Invite = InferSelectModel<typeof invites>;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createInvite(input: {
  createdBy: string;
  email?: string | null;
  expiresInMs?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + (input.expiresInMs ?? 1000 * 60 * 60 * 24 * 7), // 7 days
  );

  await db.insert(invites).values({
    email: input.email ?? null,
    tokenHash: hashInviteToken(token),
    createdBy: input.createdBy,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Atomically validates *and* consumes an invite in a single UPDATE, so two
 * concurrent registrations racing on the same single-use invite can never
 * both succeed: the `usedAt IS NULL` guard means only one UPDATE can match
 * and return a row, even under concurrent execution. Call this BEFORE
 * creating the account — if account creation subsequently fails, the invite
 * stays consumed (acceptable: the caller must issue a new one).
 */
export async function claimInvite(
  token: string,
  email: string,
): Promise<Invite | null> {
  const tokenHash = hashInviteToken(token);
  const rows = await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        isNull(invites.usedAt),
        sql`${invites.expiresAt} > now()`,
        or(
          isNull(invites.email),
          sql`lower(${invites.email}) = lower(${email})`,
        ),
      ),
    )
    .returning();

  return rows[0] ?? null;
}
