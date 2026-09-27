/**
 * A minimal, dependency-free UUIDv5 (name-based, SHA-1) implementation, used
 * only to deterministically remap a timing entry's id when the original id
 * from an imported bundle already belongs to a different user. See
 * docs/SPEC.md, section "Export / import", and `import.ts`.
 */

import { createHash } from "node:crypto";

function parseUuid(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** RFC 4122 UUIDv5: deterministic given the same `namespace` (a UUID
 * string) and `name`. */
export function uuidv5(namespace: string, name: string): string {
  const namespaceBytes = parseUuid(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1")
    .update(Buffer.concat([namespaceBytes, nameBytes]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xxxxxx
  return formatUuid(bytes);
}
