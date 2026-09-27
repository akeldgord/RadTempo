import { redirect } from "next/navigation";
import { hasAnyUsers, isSetupConfigured } from "@/server/setup-status";
import { AuthHeader } from "@/components/auth-header";
import { SetupForm } from "./setup-form";

// This page's redirect depends only on a DB row count, with no dynamic API
// call to force per-request rendering — without this it gets statically
// prerendered at build time and would keep serving a stale "no users yet"
// (or "already set up") decision forever.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUsers()) {
    redirect("/login");
  }

  const configured = isSetupConfigured();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <AuthHeader
          title="Set up RadTempo"
          description="Create the first administrator account for this instance."
        />
        {configured ? (
          <SetupForm />
        ) : (
          <p role="alert" className="text-sm text-danger">
            Initial setup is not configured. Set SETUP_TOKEN or initial
            administrator credentials on the server.
          </p>
        )}
      </div>
    </div>
  );
}
