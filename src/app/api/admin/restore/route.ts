import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/server/auth-helpers";
import {
  BackupError,
  RESTORE_CONFIRMATION_PHRASE,
  performRestore,
} from "@/server/backup";

/**
 * Restores the database from an encrypted backup upload. Intentionally does
 * NOT call `assertNotMaintenance` — restoring is how the instance gets out
 * of maintenance mode, not a mutation it should block.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  const formData = await request.formData();
  const passphrase = formData.get("passphrase");
  const confirmation = formData.get("confirmation");
  const file = formData.get("file");

  if (typeof passphrase !== "string" || passphrase.length === 0) {
    return NextResponse.json(
      { error: "Passphrase is required" },
      { status: 400 },
    );
  }
  if (confirmation !== RESTORE_CONFIRMATION_PHRASE) {
    return NextResponse.json(
      { error: `Type "${RESTORE_CONFIRMATION_PHRASE}" to confirm.` },
      { status: 400 },
    );
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Backup file is required" },
      { status: 400 },
    );
  }

  const encrypted = Buffer.from(await file.arrayBuffer());

  try {
    await performRestore(passphrase, encrypted);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
