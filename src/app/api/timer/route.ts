import { NextResponse } from "next/server";
import { db } from "@/db";
import { getActiveTimer } from "@/features/timer/service";
import { UnauthorizedError, requireUser } from "@/server/auth-helpers";

/**
 * Returns the caller's current active timer (or null), for client polling
 * and resync-on-reconnect. Never cached — the DB is authoritative.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const timer = await getActiveTimer(db, user.id);
    return NextResponse.json(
      { ok: true, data: timer },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("GET /api/timer failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load your active timer." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
