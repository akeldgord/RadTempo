/**
 * Bounded, streaming extraction of an uploaded export archive.
 *
 * `unzipSync` (whole-buffer in, whole-decompressed-output out) lets a small
 * malicious zip ("zip bomb") force an unbounded amount of memory to be
 * allocated for the decompressed output before any of our own limits get a
 * chance to run. This module uses fflate's streaming `Unzip` instead: the
 * archive is fed in small chunks, and the number of entries and the
 * cumulative *decompressed* byte count are tracked as inflation happens, so
 * a violation aborts immediately — the offending file's decompression
 * stream is torn down and no further chunks are pushed into the archive at
 * all. Nothing is ever written to disk.
 *
 * Bytes-per-timing measurement (see docs/SPEC.md "Export / import" and the
 * remediation notes for how these numbers were produced): a `timings.json`
 * entry with 1 tag and 1 pause event serializes (via `JSON.stringify(...,
 * null, 2)`, matching `export.ts`) to ~606 bytes; with 3 tags/2 pause events
 * ~813 bytes; with 5 tags/3 pause events ~1020 bytes. At the hard cap of
 * 200,000 timings (`MAX_TIMINGS`), that is ~121MB / ~163MB / ~204MB
 * respectively for `timings.json` alone. `study-types.json` at its cap of
 * 2000 rows and `tags.json` at its cap of 500 rows measure well under 1MB
 * each. `TIMINGS_JSON_MAX_BYTES` and `MAX_UNCOMPRESSED_BYTES` below are set
 * with headroom above the realistic (not schema-maximum) heavy end of that
 * range.
 */

import { Unzip, UnzipInflate } from "fflate";
import type { UnzipFile } from "fflate";

/** Zip entries beyond this are rejected outright — the archive only ever
 * legitimately holds the 6 required JSON files plus the optional CSV. */
export const MAX_ZIP_ENTRIES = 8;

/** Small, fixed-shape JSON files. Generous relative to their measured size
 * (well under 1MB each at their schema caps) to absorb formatting/encoding
 * variance without being a meaningful bomb vector. */
const SMALL_JSON_MAX_BYTES = 4 * 1024 * 1024;

/** `timings.json` is the one file whose size scales with user data. See the
 * module doc comment for how this was measured. */
const TIMINGS_JSON_MAX_BYTES = 190 * 1024 * 1024;

/** Sum of every per-file cap below, plus headroom — the total amount of
 * decompressed output this module will ever produce for one archive. */
export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

const PER_FILE_MAX_BYTES: Record<string, number> = {
  "manifest.json": SMALL_JSON_MAX_BYTES,
  "profile.json": SMALL_JSON_MAX_BYTES,
  "study-types.json": SMALL_JSON_MAX_BYTES,
  "tags.json": SMALL_JSON_MAX_BYTES,
  "timings.json": TIMINGS_JSON_MAX_BYTES,
  "preferences.json": SMALL_JSON_MAX_BYTES,
};

/** `timings.csv` is derived output, never round-tripped on import (see
 * `schema.ts`), so its content is never inflated at all — only its
 * presence as an allowed, non-duplicate entry is checked. */
const IGNORED_CONTENT_FILES = new Set(["timings.csv"]);

export const ALLOWED_ZIP_ENTRIES = new Set([
  "manifest.json",
  "profile.json",
  "study-types.json",
  "tags.json",
  "timings.json",
  "preferences.json",
  "timings.csv",
]);

// DEFLATE can expand ~1032:1, so one pushed chunk can emit up to ~1032x its
// size before the caps above are checked. 16KB keeps that burst near 16MB.
const PUSH_CHUNK_SIZE = 16 * 1024;

export type ExtractZipResult =
  | { ok: true; files: Record<string, Uint8Array> }
  | { ok: false; error: string };

function isValidEntryName(name: string): boolean {
  return (
    ALLOWED_ZIP_ENTRIES.has(name) &&
    !name.endsWith("/") &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

/**
 * Extracts the allow-listed JSON files from an uploaded export archive,
 * enforcing entry-count, per-file, and total-decompressed-byte limits as
 * inflation happens rather than after the fact. Never throws — any
 * violation, or a malformed archive, comes back as `{ ok: false }`.
 */
export function extractZipBounded(
  buffer: Buffer | Uint8Array,
): ExtractZipResult {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  const outputs = new Map<string, Uint8Array[]>();
  const fileBytes = new Map<string, number>();
  const seenNames = new Set<string>();
  let totalBytes = 0;
  let entryCount = 0;
  let failure: string | null = null;

  unzip.onfile = (file: UnzipFile) => {
    if (failure) return;

    entryCount++;
    if (entryCount > MAX_ZIP_ENTRIES) {
      failure = "Export archive has too many entries.";
      return;
    }

    const name = file.name;
    if (!isValidEntryName(name)) {
      failure = "Export archive contains an unexpected or invalid entry.";
      return;
    }
    if (seenNames.has(name)) {
      failure = `Duplicate ${name} entry in export archive.`;
      return;
    }
    seenNames.add(name);

    if (IGNORED_CONTENT_FILES.has(name)) {
      // Never decompress: content is unused on import.
      return;
    }

    const cap = PER_FILE_MAX_BYTES[name] ?? SMALL_JSON_MAX_BYTES;
    // Trust neither the header's declared original size nor the local
    // per-file/total tallies alone — both are checked, and the tallies are
    // the authority since they reflect bytes actually emitted by inflate.
    if (typeof file.originalSize === "number" && file.originalSize > cap) {
      failure = `${name} is too large.`;
      return;
    }

    outputs.set(name, []);
    fileBytes.set(name, 0);

    file.ondata = (err, data, _final) => {
      if (failure) return;
      if (err) {
        failure = "Could not read the uploaded file as a zip archive.";
        return;
      }
      const soFar = (fileBytes.get(name) ?? 0) + data.length;
      fileBytes.set(name, soFar);
      totalBytes += data.length;

      if (soFar > cap) {
        failure = `${name} is too large.`;
        file.terminate();
        return;
      }
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        failure = "Export archive is too large once decompressed.";
        file.terminate();
        return;
      }
      outputs.get(name)!.push(data);
    };

    file.start();
  };

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  try {
    if (bytes.length === 0) {
      unzip.push(bytes, true);
    } else {
      for (let offset = 0; offset < bytes.length; offset += PUSH_CHUNK_SIZE) {
        if (failure) break;
        const end = Math.min(offset + PUSH_CHUNK_SIZE, bytes.length);
        const isFinal = end >= bytes.length;
        unzip.push(bytes.subarray(offset, end), isFinal);
      }
    }
  } catch {
    if (!failure) {
      failure = "Could not read the uploaded file as a zip archive.";
    }
  }

  if (failure) {
    return { ok: false, error: failure };
  }

  const files: Record<string, Uint8Array> = {};
  for (const [name, chunks] of outputs) {
    const total = fileBytes.get(name) ?? 0;
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    files[name] = combined;
  }
  return { ok: true, files };
}
