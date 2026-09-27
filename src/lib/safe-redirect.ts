/**
 * Sanitizes a user-controlled redirect target (e.g. a `?next=` query param)
 * so it can only ever send the browser to a same-origin, in-app path.
 *
 * Rejects anything that could be used for an open-redirect / protocol-relative
 * attack: absolute URLs to other origins, `javascript:`/`data:` schemes,
 * protocol-relative (`//evil.example`) and backslash tricks browsers treat as
 * protocol-relative (`/\evil.example`, `\\evil`), and anything that isn't a
 * plain string. Falls back to `/` for anything not clearly safe.
 */
export function sanitizeInternalRedirect(
  input: unknown,
  origin = "http://radtempo.invalid",
): string {
  if (typeof input !== "string" || input.length === 0) {
    return "/";
  }

  // Must start with a single "/" (a path), never "//" or "/\" which browsers
  // can interpret as protocol-relative, and never contain backslashes or
  // control characters anywhere.
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//") || input.startsWith("/\\")) return "/";
  if (input.includes("\\")) return "/";
  if (/[\u0000-\u001f]/.test(input)) return "/";

  let url: URL;
  try {
    url = new URL(input, origin);
  } catch {
    return "/";
  }

  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return "/";
  }

  if (url.origin !== base.origin) {
    return "/";
  }

  return `${url.pathname}${url.search}${url.hash}` || "/";
}
