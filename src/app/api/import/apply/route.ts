import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { UnauthorizedError, requireUser } from "@/server/auth-helpers";
import { assertNotMaintenance, MaintenanceModeError } from "@/server/settings";
import { PayloadTooLargeError, readBodyWithLimit } from "@/server/http";
import { applyImport, parseImport } from "@/features/import-export/import";
import { MAX_ZIP_BYTES } from "@/features/import-export/schema";
import { ValidationError } from "@/server/errors";

function parseApplyPreferences(
  url: URL,
): { ok: true; value: boolean } | { ok: false } {
  const raw = url.searchParams.get("applyPreferences");
  if (raw === "true") return { ok: true, value: true };
  if (raw === "false") return { ok: true, value: false };
  return { ok: false };
}

/**
 * Applies an uploaded export archive for the current user. Re-parses and
 * re-validates the file from scratch — it never trusts a client-held
 * preview result, and it never accepts a user id from the client: the
 * target is always the authenticated caller.
 *
 * Auth is checked, and the instance's maintenance mode, before the body is
 * ever read.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        {
          status: 401,
        },
      );
    }
    throw error;
  }

  try {
    await assertNotMaintenance();
  } catch (error) {
    if (error instanceof MaintenanceModeError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        {
          status: 503,
        },
      );
    }
    throw error;
  }

  const applyPreferences = parseApplyPreferences(new URL(request.url));
  if (!applyPreferences.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'applyPreferences query parameter must be "true" or "false".',
      },
      { status: 400 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/zip")) {
    return NextResponse.json(
      { ok: false, error: "Expected an application/zip request body." },
      { status: 415 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await readBodyWithLimit(request, MAX_ZIP_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Export file is too large (max ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB).`,
        },
        { status: 413 },
      );
    }
    throw error;
  }

  const parsed = parseImport(buffer);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      {
        status: 400,
      },
    );
  }

  try {
    const data = await applyImport(db, user.id, parsed.bundle, {
      applyPreferences: applyPreferences.value,
    });
    revalidatePath("/settings");
    revalidatePath("/settings/data");
    revalidatePath("/history");
    revalidatePath("/dashboard");
    revalidatePath("/studies");
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof MaintenanceModeError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        {
          status: 503,
        },
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        {
          status: 400,
        },
      );
    }
    console.error("POST /api/import/apply failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not import this file." },
      { status: 500 },
    );
  }
}
