import { NextResponse } from "next/server";
import {
  ForbiddenError,
  requireAdmin,
  UnauthorizedError,
} from "@/server/auth-helpers";
import { assertNotMaintenance } from "@/server/settings";
import { backupFilename, createBackup, BackupError } from "@/server/backup";

/**
 * Streams an encrypted database backup as a download. The passphrase never
 * leaves the request body / this handler; it is not stored anywhere.
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

  await assertNotMaintenance();

  let passphrase: unknown;
  try {
    const body = await request.json();
    passphrase = body?.passphrase;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (typeof passphrase !== "string") {
    return NextResponse.json(
      { error: "Passphrase is required" },
      { status: 400 },
    );
  }

  try {
    const encrypted = await createBackup(passphrase);
    const filename = backupFilename();
    return new NextResponse(new Uint8Array(encrypted), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(encrypted.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
