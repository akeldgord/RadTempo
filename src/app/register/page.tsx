import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/server/setup-status";
import { getCurrentUser } from "@/server/auth-helpers";
import { AuthHeader } from "@/components/auth-header";
import { RegisterForm } from "./register-form";

// See src/app/setup/page.tsx: the hasAnyUsers() check has no dynamic API
// call, so this must be forced dynamic to avoid serving a stale redirect
// decision from build time.
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (!(await hasAnyUsers())) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  const { invite } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <AuthHeader
          title="Create your account"
          description="Measures your own reading pace over time. It does not compare you with other radiologists."
        />
        <RegisterForm inviteToken={invite} />
      </div>
    </div>
  );
}
