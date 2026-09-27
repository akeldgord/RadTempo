export async function register() {
  // Only run in the Node.js server runtime (not edge, not the build step's
  // static analysis pass).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrapInitialAdmin } = await import("@/server/bootstrap");
  try {
    await bootstrapInitialAdmin();
  } catch (error) {
    console.error("[bootstrap] Failed to create initial admin:", error);
  }
}
