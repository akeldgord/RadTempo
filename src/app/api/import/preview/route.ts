import { NextResponse } from "next/server";
import { db } from "@/db";
import { UnauthorizedError, requireUser } from "@/server/auth-helpers";
import { PayloadTooLargeError, readBodyWithLimit } from "@/server/http";
import { parseImport, previewImport } from "@/features/import-export/import";
import { MAX_ZIP_BYTES } from "@/features/import-export/schema";

/**
 * Previews an uploaded export archive for the current user without writing
 * anything. `POST /api/import/apply` re-parses and re-validates the file
 * itself rather than trusting this preview's result.
 *
 * Auth is checked before the body is ever read, so an unauthenticated
 * request is rejected without the cost of reading or decompressing
 * anything.
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
    const data = await previewImport(db, user.id, parsed.bundle);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("POST /api/import/preview failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not preview this import." },
      { status: 500 },
    );
  }
}
