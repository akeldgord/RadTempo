import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";

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
 * Validates an invite token for the given email (if the invite was scoped to
 * one). Does NOT mark it used — call `consumeInvite` only after the user has
 * actually been created, to preserve single-use semantics.
 */
export async function findValidInvite(token: string, email: string) {
  const tokenHash = hashInviteToken(token);
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt)));

  const invite = rows[0];
  if (!invite) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return null;
  }

  return invite;
}

export async function consumeInvite(inviteId: string): Promise<void> {
  await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)));
}
