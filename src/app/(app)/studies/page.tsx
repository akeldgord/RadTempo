import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { listStudyTypes } from "@/features/studies/service";
import { StudiesClient } from "./studies-client";

export default async function StudiesPage() {
  const user = await requireUser();
  const studyTypes = await listStudyTypes(db, user.id);
  return <StudiesClient initialStudyTypes={studyTypes} />;
}
