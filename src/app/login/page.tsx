import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/server/setup-status";
import { getCurrentUser } from "@/server/auth-helpers";
import { AuthHeader } from "@/components/auth-header";
import { LoginForm } from "./login-form";

// See src/app/setup/page.tsx: the hasAnyUsers() check has no dynamic API
// call, so this must be forced dynamic to avoid serving a stale redirect
// decision from build time.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <AuthHeader
          title="Sign in"
          description="Personal performance tracking for radiologists."
        />
        <LoginForm />
      </div>
    </div>
  );
}
