import { NextResponse } from "next/server";
import { db } from "@/db";
import { UnauthorizedError, requireUser } from "@/server/auth-helpers";
import {
  buildUserExport,
  exportFilename,
} from "@/features/import-export/export";

/**
 * Streams the caller's own personal data export as a zip download. Scoped
 * entirely to the authenticated session's user — never accepts a target
 * user id from the client. See docs/SPEC.md, section "Export / import".
 */
export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const zip = await buildUserExport(db, user.id, now);
    const filename = exportFilename(now);

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(zip.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("GET /api/export failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not build your export." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
