export async function register() {
  // Only run in the Node.js server runtime (not edge, not the build step's
  // static analysis pass).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrapInitialAdmin } = await import("@/server/bootstrap");
  try {
    await bootstrapInitialAdmin();
  } catch (error) {
    // Log only name/message/stack, never the raw error object — it could
    // otherwise embed INITIAL_ADMIN_EMAIL. See docs/security-review.md.
    const safe =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error);
    console.error("[bootstrap] Failed to create initial admin:", safe);
  }
}
