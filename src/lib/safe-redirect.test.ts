import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirect } from "./safe-redirect";

describe("sanitizeInternalRedirect", () => {
  it("rejects unsafe inputs", () => {
    expect(sanitizeInternalRedirect("javascript:alert(1)")).toBe("/");
    expect(sanitizeInternalRedirect("//evil.example")).toBe("/");
    expect(sanitizeInternalRedirect("https://evil.example")).toBe("/");
    expect(
      sanitizeInternalRedirect("data:text/html,<script>alert(1)</script>"),
    ).toBe("/");
    expect(sanitizeInternalRedirect("/\\evil.example")).toBe("/");
    expect(sanitizeInternalRedirect("\\\\evil")).toBe("/");
    expect(sanitizeInternalRedirect("")).toBe("/");
    expect(sanitizeInternalRedirect(null)).toBe("/");
    expect(sanitizeInternalRedirect(undefined)).toBe("/");
    expect(sanitizeInternalRedirect(123)).toBe("/");
    expect(sanitizeInternalRedirect(["/dashboard"])).toBe("/");
  });

  it("accepts safe same-origin paths", () => {
    expect(sanitizeInternalRedirect("/")).toBe("/");
    expect(sanitizeInternalRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/history?page=2")).toBe("/history?page=2");
    expect(
      sanitizeInternalRedirect(
        "/analytics/123e4567-e89b-12d3-a456-426614174000?from=2026-01-01",
      ),
    ).toBe("/analytics/123e4567-e89b-12d3-a456-426614174000?from=2026-01-01");
  });
});
