import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/server/setup-status";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  if (await hasAnyUsers()) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Set up RadTempo
          </h1>
          <p className="mt-1 text-sm text-muted">
            Create the first administrator account for this instance.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
