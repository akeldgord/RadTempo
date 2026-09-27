/**
 * Small shared helpers for route handlers that accept a raw request body
 * from an untrusted client.
 */

export class PayloadTooLargeError extends Error {
  constructor(message = "Payload too large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Reads `request.body` into a single `Buffer`, enforcing `limitBytes` the
 * whole way through: an early rejection from a too-large `Content-Length`
 * header, and — since that header can be absent or wrong — a running count
 * of bytes actually read off the stream, aborting (cancelling the reader,
 * never buffering past the limit) the moment the count is exceeded.
 *
 * Deliberately never calls `request.arrayBuffer()`/`request.formData()`,
 * which buffer an unbounded amount of the body before any check can run.
 */
export async function readBodyWithLimit(
  request: Request,
  limitBytes: number,
): Promise<Buffer> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > limitBytes) {
      throw new PayloadTooLargeError();
    }
  }

  if (!request.body) {
    return Buffer.alloc(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.length;
    if (total > limitBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return Buffer.from(result);
}
