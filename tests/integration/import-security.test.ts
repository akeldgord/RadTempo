import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Zip, ZipDeflate, strToU8, unzipSync, zipSync } from "fflate";
import { eq } from "drizzle-orm";
import { sql as rawSql, db } from "@/db";
import { timingEntries, userStudyTypes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { runWithRegistrationAllowed } from "@/server/registration-gate";
import * as studiesService from "@/features/studies/service";
import { buildUserExport } from "@/features/import-export/export";
import { MAX_ZIP_BYTES } from "@/features/import-export/schema";
import { MAX_UNCOMPRESSED_BYTES } from "@/features/import-export/zip";

/**
 * `next/headers` only works inside a real Next.js request context. To
 * exercise the route handlers' `requireUser()` call from a plain
 * integration test, we mock it the same way `tests/integration/admin.test.ts`
 * does: a Headers object we control, carrying a real Better Auth session
 * cookie obtained via `auth.api.signInEmail`.
 */
let currentHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: async () => currentHeaders,
}));

/**
 * `revalidatePath` requires the Next.js request-scoped static generation
 * store, which only exists inside a real request handled by the Next.js
 * server — not when a route handler's `POST` is invoked directly the way
 * these tests do. Stub it out; only the imported data is under test here.
 */
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

async function signUp(email: string, password = "password123") {
  return runWithRegistrationAllowed(() =>
    auth.api.signUpEmail({ body: { email, password, name: "Test" } }),
  );
}

async function signInAs(email: string, password = "password123") {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookiePair = setCookie.split(";")[0];
  currentHeaders = new Headers({ cookie: cookiePair });
}

function clearSession() {
  currentHeaders = new Headers();
}

async function resetDatabase() {
  await rawSql`truncate table "user" cascade`;
}

beforeEach(async () => {
  clearSession();
  await resetDatabase();
});

afterEach(() => {
  clearSession();
});

afterAll(async () => {
  await resetDatabase();
  await rawSql.end();
});

function zipRequest(url: string, body: BodyInit | Buffer): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: body as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

/** Builds a raw zip buffer with the given entries, one call to `ZipDeflate`
 * per entry — unlike `zipSync`'s plain-object input, this allows duplicate
 * filenames, which is exactly what the duplicate-entry test needs. */
async function buildZipRaw(
  entries: { name: string; data: Uint8Array }[],
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((_err, dat) => {
    if (dat) chunks.push(dat);
  });
  for (const entry of entries) {
    const f = new ZipDeflate(entry.name, { level: 9 });
    zip.add(f);
    f.push(entry.data, true);
  }
  zip.end();
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function seedStudyType(userId: string) {
  return studiesService.createStudyType(db, userId, {
    modality: "CT",
    bodyRegion: "Abdomen/Pelvis",
    name: "CT A/P +C",
    shortName: "CTAPX",
  });
}

describe("import route handlers: authentication and body bounds", () => {
  // The Request/ReadableStream plumbing itself eagerly primes a stream with
  // one `pull()` right after construction, even with zero consumers (an
  // internal buffering detail, not our code), so "body not read" can't be
  // asserted as "pull was never called". What it can check: without a
  // consumer draining it, backpressure keeps a never-ending source's `pull`
  // count pinned at that single priming call — if the route instead read
  // the body (e.g. before checking auth), draining a never-closing stream
  // would call `pull` far more than once (and, since it never closes, the
  // route would hang rather than return quickly).
  it("rejects an unauthenticated preview request with 401, without reading the body", async () => {
    clearSession();
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        controller.enqueue(new Uint8Array(1024));
        // Deliberately never closes.
      },
    });

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/preview", body),
    );

    expect(response.status).toBe(401);
    expect(pullCount).toBeLessThanOrEqual(1);
  });

  it("rejects an unauthenticated apply request with 401, without reading the body", async () => {
    clearSession();
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        controller.enqueue(new Uint8Array(1024));
        // Deliberately never closes.
      },
    });

    const { POST } = await import("@/app/api/import/apply/route");
    const response = await POST(
      zipRequest(
        "http://localhost/api/import/apply?applyPreferences=false",
        body,
      ),
    );

    expect(response.status).toBe(401);
    expect(pullCount).toBeLessThanOrEqual(1);
  });

  it("rejects an oversized streamed body with 413 without decompressing, generating only a bounded number of chunks", async () => {
    await signUp("bomb@example.com");
    await signInAs("bomb@example.com");

    const chunkSize = 1024 * 1024;
    let generated = 0;
    let chunksGenerated = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksGenerated++;
        generated += chunkSize;
        controller.enqueue(new Uint8Array(chunkSize));
        // Keep going well past the limit if not stopped — proves the
        // route aborts the read rather than us running out of data.
        if (generated > MAX_ZIP_BYTES * 3) {
          controller.close();
        }
      },
    });

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/preview", body),
    );

    expect(response.status).toBe(413);
    // Well under the 3x-limit ceiling the generator would otherwise reach.
    expect(generated).toBeLessThan(MAX_ZIP_BYTES * 1.5);
    expect(chunksGenerated).toBeLessThan(MAX_ZIP_BYTES / chunkSize + 5);
  });

  it("rejects a request whose Content-Type is not application/zip with 415", async () => {
    await signUp("wrongtype@example.com");
    await signInAs("wrongtype@example.com");

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      new Request("http://localhost/api/import/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(415);
  });

  it("rejects an apply request with a missing or malformed applyPreferences query param", async () => {
    await signUp("badquery@example.com");
    await signInAs("badquery@example.com");

    const { POST } = await import("@/app/api/import/apply/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/apply", Buffer.from("not a zip")),
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed zip bytes with 400", async () => {
    await signUp("malformed@example.com");
    await signInAs("malformed@example.com");

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest(
        "http://localhost/api/import/preview",
        Buffer.from("this is definitely not a zip file"),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});

describe("bounded zip extraction", () => {
  it("rejects a zip bomb (a small archive whose declared file inflates past the cap), before it fully decompresses, leaving the database unchanged", async () => {
    await signUp("victim@example.com");
    await signInAs("victim@example.com");

    // 210MB of zeros deflates (level 9) to roughly 210KB — comfortably
    // over MAX_UNCOMPRESSED_BYTES while staying cheap to build in a test.
    const bombSize = 210 * 1024 * 1024;
    expect(bombSize).toBeGreaterThan(MAX_UNCOMPRESSED_BYTES);

    const chunks: Uint8Array[] = [];
    const zip = new Zip((_err, dat) => {
      if (dat) chunks.push(dat);
    });
    const f = new ZipDeflate("timings.json", { level: 9 });
    zip.add(f);
    const pushChunkSize = 1024 * 1024;
    const zeroChunk = new Uint8Array(pushChunkSize);
    let written = 0;
    while (written < bombSize) {
      const remaining = bombSize - written;
      const isLast = remaining <= pushChunkSize;
      f.push(isLast ? zeroChunk.subarray(0, remaining) : zeroChunk, isLast);
      written += isLast ? remaining : pushChunkSize;
    }
    zip.end();
    const bomb = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    // The whole point of the exploit: tiny on the wire, huge inflated.
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/preview", bomb),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);

    const rows = await db.select().from(timingEntries);
    expect(rows).toHaveLength(0);
  });

  it("rejects duplicate timings.json entries in the archive", async () => {
    await signUp("dup@example.com");
    await signInAs("dup@example.com");

    const zip = await buildZipRaw([
      { name: "timings.json", data: strToU8("[]") },
      { name: "timings.json", data: strToU8("[]") },
    ]);

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/preview", zip),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/duplicate/i);
  });

  it("rejects an archive containing an unexpected extra file", async () => {
    const userA = (await signUp("extra@example.com")).user as { id: string };
    await signInAs("extra@example.com");
    await seedStudyType(userA.id);

    const validZip = await buildUserExport(db, userA.id);
    const unzipped = unzipSync(validZip);
    const tampered = Buffer.from(
      zipSync({ ...unzipped, "hack.json": strToU8("{}") }),
    );

    const { POST } = await import("@/app/api/import/preview/route");
    const response = await POST(
      zipRequest("http://localhost/api/import/preview", tampered),
    );

    expect(response.status).toBe(400);
  });
});

describe("import route handlers: happy path", () => {
  it("previews correctly, applies, and is idempotent on re-apply", async () => {
    const signUpResult = await signUp("source@example.com");
    const sourceUserId = (signUpResult.user as { id: string }).id;
    await signInAs("source@example.com");
    await seedStudyType(sourceUserId);

    const exportBuffer = await buildUserExport(db, sourceUserId);

    await signUp("dest@example.com");
    await signInAs("dest@example.com");

    const { POST: previewPOST } =
      await import("@/app/api/import/preview/route");
    const previewResponse = await previewPOST(
      zipRequest("http://localhost/api/import/preview", exportBuffer),
    );
    expect(previewResponse.status).toBe(200);
    const previewBody = await previewResponse.json();
    expect(previewBody.ok).toBe(true);
    expect(previewBody.data.studyTypes.new).toBe(1);
    expect(previewBody.data.cases.new).toBe(0);

    const { POST: applyPOST } = await import("@/app/api/import/apply/route");
    const applyResponse = await applyPOST(
      zipRequest(
        "http://localhost/api/import/apply?applyPreferences=false",
        exportBuffer,
      ),
    );
    expect(applyResponse.status).toBe(200);
    const applyBody = await applyResponse.json();
    expect(applyBody.ok).toBe(true);
    expect(applyBody.data.studyTypes.created).toBe(1);

    // Re-apply: no duplicate study type gets created.
    const secondApply = await applyPOST(
      zipRequest(
        "http://localhost/api/import/apply?applyPreferences=false",
        exportBuffer,
      ),
    );
    expect(secondApply.status).toBe(200);
    const secondApplyBody = await secondApply.json();
    expect(secondApplyBody.ok).toBe(true);
    expect(secondApplyBody.data.studyTypes.created).toBe(0);
    expect(secondApplyBody.data.studyTypes.matched).toBe(1);

    const destStudyTypes = await db
      .select()
      .from(userStudyTypes)
      .where(eq(userStudyTypes.name, "CT A/P +C"));
    // One for the source user, one for the destination user — never
    // duplicated for the destination user across the two applies.
    expect(destStudyTypes).toHaveLength(2);
  });
});
