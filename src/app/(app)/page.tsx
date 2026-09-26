import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { getHomeSections } from "@/features/studies/service";
import { StartPageClient } from "./start-page-client";

export default async function StartPage() {
  const user = await requireUser();
  const sections = await getHomeSections(db, user.id);
  return <StartPageClient sections={sections} />;
}
