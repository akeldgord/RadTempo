import { randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull, max } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import {
  account as accountTable,
  invites as invitesTable,
  session as sessionTable,
  user as userTable,
} from "@/db/schema";
import { createInvite } from "@/server/invites";
import { isSmtpConfigured, sendMail } from "@/server/mailer";

export type Role = "USER" | "ADMIN";

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  disabledAt: Date | null;
  lastSessionAt: Date | null;
};

export type PendingInvite = {
  id: string;
  email: string | null;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
};

export class AdminActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminActionError";
  }
}

/**
 * Generates a temporary password suitable for showing an admin once:
 * cryptographically random, 16 characters, alphanumeric-only so it's easy to
 * read/retype (no ambiguous symbol escaping issues).
 */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Never includes any performance/timing data — account metadata only. */
export async function listUsers(): Promise<AdminUserSummary[]> {
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      createdAt: userTable.createdAt,
      disabledAt: userTable.disabledAt,
      lastSessionAt: max(sessionTable.createdAt),
    })
    .from(userTable)
    .leftJoin(sessionTable, eq(sessionTable.userId, userTable.id))
    .groupBy(
      userTable.id,
      userTable.email,
      userTable.name,
      userTable.role,
      userTable.createdAt,
      userTable.disabledAt,
    )
    .orderBy(desc(userTable.createdAt));

  return rows;
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: invitesTable.id,
      email: invitesTable.email,
      createdBy: invitesTable.createdBy,
      createdAt: invitesTable.createdAt,
      expiresAt: invitesTable.expiresAt,
    })
    .from(invitesTable)
    .where(isNull(invitesTable.usedAt))
    .orderBy(desc(invitesTable.createdAt));

  return rows;
}

async function countAdmins(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(userTable)
    .where(and(eq(userTable.role, "ADMIN"), isNull(userTable.disabledAt)));
  return rows[0]?.value ?? 0;
}

async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const target = await db
    .select({ role: userTable.role, disabledAt: userTable.disabledAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const row = target[0];
  if (!row || row.role !== "ADMIN" || row.disabledAt) return false;
  const admins = await countAdmins();
  return admins <= 1;
}

/**
 * Creates a user account directly (bypassing self-registration policy,
 * which does not apply to admin-created accounts) with a generated
 * temporary password. The plaintext password is returned once and must
 * never be stored or logged.
 */
export async function createUser(input: {
  email: string;
  name: string;
  role?: Role;
}): Promise<{ userId: string; temporaryPassword: string }> {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, input.email.toLowerCase()))
    .limit(1);
  if (existing[0]) {
    throw new AdminActionError("A user with this email already exists.");
  }

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const userId = await db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(userTable)
      .values({
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role ?? "USER",
        emailVerified: false,
      })
      .returning({ id: userTable.id });

    await tx.insert(accountTable).values({
      userId: createdUser.id,
      accountId: createdUser.id,
      providerId: "credential",
      password: passwordHash,
    });

    return createdUser.id;
  });

  return { userId, temporaryPassword };
}

export async function inviteUser(input: {
  createdBy: string;
  email?: string | null;
  appUrl: string;
}): Promise<{ link: string; emailed: boolean }> {
  if (input.email) {
    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, input.email.toLowerCase()))
      .limit(1);
    if (existing[0]) {
      throw new AdminActionError("A user with this email already exists.");
    }
  }

  const { token } = await createInvite({
    createdBy: input.createdBy,
    email: input.email,
  });
  const link = `${input.appUrl.replace(/\/$/, "")}/register?invite=${token}`;

  let emailed = false;
  if (input.email && isSmtpConfigured()) {
    await sendMail({
      to: input.email,
      subject: "You're invited to RadTempo",
      text: `You've been invited to create a RadTempo account.\n\n${link}\n\nThis link expires in 7 days and can be used once.`,
    });
    emailed = true;
  }

  return { link, emailed };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await db.delete(invitesTable).where(eq(invitesTable.id, inviteId));
}

async function revokeSessions(userId: string): Promise<void> {
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
}

export async function disableUser(userId: string): Promise<void> {
  await db
    .update(userTable)
    .set({ disabledAt: new Date(), updatedAt: new Date() })
    .where(eq(userTable.id, userId));
  await revokeSessions(userId);
}

export async function enableUser(userId: string): Promise<void> {
  await db
    .update(userTable)
    .set({ disabledAt: null, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
}

export async function deleteUser(
  userId: string,
  actingAdminId: string,
): Promise<void> {
  if (userId === actingAdminId) {
    throw new AdminActionError("You cannot delete your own account here.");
  }

  const target = await db
    .select({ role: userTable.role, disabledAt: userTable.disabledAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!target[0]) {
    throw new AdminActionError("User not found.");
  }

  if (target[0].role === "ADMIN" && (await isLastActiveAdmin(userId))) {
    throw new AdminActionError("Cannot delete the last remaining admin.");
  }

  await db.delete(userTable).where(eq(userTable.id, userId));
}

export async function setUserRole(
  userId: string,
  role: Role,
  actingAdminId: string,
): Promise<void> {
  if (role === "USER" && userId === actingAdminId) {
    const admins = await countAdmins();
    if (admins <= 1) {
      throw new AdminActionError("Cannot demote the last remaining admin.");
    }
  }

  if (role === "USER" && (await isLastActiveAdmin(userId))) {
    throw new AdminActionError("Cannot demote the last remaining admin.");
  }

  await db
    .update(userTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
}

/**
 * Generates a new temporary password for a user without requiring SMTP,
 * hashes it the same way Better Auth hashes credential passwords, and
 * writes it to (or creates) their `credential` account row. Revokes all of
 * the user's sessions. The plaintext password is returned once.
 */
export async function resetUserCredentials(
  userId: string,
): Promise<{ temporaryPassword: string }> {
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const existing = await db
    .select({ id: accountTable.id })
    .from(accountTable)
    .where(
      and(
        eq(accountTable.userId, userId),
        eq(accountTable.providerId, "credential"),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(accountTable)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(accountTable.id, existing[0].id));
  } else {
    await db.insert(accountTable).values({
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
  }

  await revokeSessions(userId);

  return { temporaryPassword };
}

export { countAdmins };
