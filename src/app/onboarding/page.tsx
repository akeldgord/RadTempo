import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth-helpers";
import { STUDY_TYPE_TEMPLATES } from "@/features/studies/templates";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.onboardedAt) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <OnboardingFlow templates={STUDY_TYPE_TEMPLATES} />
      </div>
    </div>
  );
}
