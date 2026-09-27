import { spawn } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Encrypter, Decrypter } from "age-encryption";
import { db } from "@/db";
import { session } from "@/db/schema";
import { getInstanceSettings, updateInstanceSettings } from "@/server/settings";

export const MIN_BACKUP_PASSPHRASE_LENGTH = 12;
export const RESTORE_CONFIRMATION_PHRASE = "RESTORE";

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new BackupError("DATABASE_URL is not configured.");
  }
  return url;
}

function assertPassphrase(passphrase: string): void {
  if (passphrase.length < MIN_BACKUP_PASSPHRASE_LENGTH) {
    throw new BackupError(
      `Passphrase must be at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters.`,
    );
  }
}

function runCommand(
  command: string,
  args: string[],
  input?: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      reject(new BackupError(`Failed to run ${command}: ${error.message}`));
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new BackupError(
            `${command} exited with code ${exitCode}: ${Buffer.concat(stderrChunks).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function dumpDatabase(): Promise<Buffer> {
  const databaseUrl = requireDatabaseUrl();
  return runCommand("pg_dump", [
    "-Fc",
    "--no-owner",
    "--no-privileges",
    databaseUrl,
  ]);
}

async function restoreDatabase(dump: Buffer): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  await runCommand(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "-d", databaseUrl],
    dump,
  );
}

async function runMigrations(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    const migrationDb = drizzle(migrationClient);
    await migrate(migrationDb, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await migrationClient.end();
  }
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `radtempo-backup-${stamp}.dump.age`;
}

/**
 * Dumps the database (`pg_dump -Fc`) and encrypts it with `age` in
 * passphrase (scrypt) mode via the official TypeScript `age-encryption`
 * implementation. Returns the encrypted bytes; callers stream them as a
 * download and never persist the passphrase anywhere.
 */
export async function createBackup(passphrase: string): Promise<Buffer> {
  assertPassphrase(passphrase);
  const dump = await dumpDatabase();

  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  const encrypted = await encrypter.encrypt(dump);
  return Buffer.from(encrypted);
}

/**
 * Decrypts an encrypted backup with the given passphrase. Throws
 * `BackupError` (without ever touching the database) if the passphrase is
 * wrong or the file is corrupt/not a valid age file.
 */
export async function decryptBackup(
  passphrase: string,
  encrypted: Buffer,
): Promise<Buffer> {
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  try {
    const decrypted = await decrypter.decrypt(new Uint8Array(encrypted));
    return Buffer.from(decrypted);
  } catch {
    throw new BackupError(
      "Could not decrypt this backup: wrong passphrase, or the file is corrupted.",
    );
  }
}

/**
 * Deletes every auth session. A restored dump contains the `session` rows
 * that existed when the backup was taken, including ones revoked since, so
 * they must never survive a restore.
 */
async function deleteAllSessions(): Promise<void> {
  await db.delete(session);
}

/**
 * Full restore flow: decrypt first (so a wrong passphrase fails before any
 * database write happens), then enter maintenance mode, run
 * `pg_restore --clean --if-exists`, re-run migrations (in case the backup
 * predates a schema change), delete every session, and finally turn
 * maintenance mode back off. Since `pg_restore --clean` replaces
 * `instance_settings` wholesale (including whatever `maintenance_mode` value
 * the backup had), the flag is set explicitly after restore rather than
 * relying on its pre-restore value.
 *
 * Every signed-in user (including the admin who triggered this) must sign in
 * again afterwards.
 */
export async function performRestore(
  passphrase: string,
  encrypted: Buffer,
): Promise<void> {
  const dump = await decryptBackup(passphrase, encrypted);

  await updateInstanceSettings({ maintenanceMode: true });
  let sessionsCleared = false;
  try {
    await restoreDatabase(dump);
    await runMigrations();
    await deleteAllSessions();
    sessionsCleared = true;
  } finally {
    // A failed restore may still have restored some session rows; clear
    // them best-effort before leaving maintenance mode.
    if (!sessionsCleared) {
      try {
        await deleteAllSessions();
      } catch {
        // ignore; the original error is rethrown below.
      }
    }
    // Best-effort: if this throws (e.g. the restored DB has no
    // instance_settings row), maintenance mode is off by default for a
    // freshly-created row anyway.
    try {
      await getInstanceSettings();
      await updateInstanceSettings({ maintenanceMode: false });
    } catch {
      // ignore; nothing more we can safely do here.
    }
  }
}
