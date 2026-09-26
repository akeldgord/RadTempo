import { db } from "@/db";
import { requireUser } from "@/server/auth-helpers";
import { listStudyTypes } from "@/features/studies/service";
import { listTags } from "@/features/tags/service";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const user = await requireUser();
  const [studyTypes, tags] = await Promise.all([
    listStudyTypes(db, user.id),
    listTags(db, user.id),
  ]);
  return <HistoryClient studyTypes={studyTypes} tags={tags} />;
}
