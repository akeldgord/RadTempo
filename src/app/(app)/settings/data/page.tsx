import { requireUser } from "@/server/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { ExportSection } from "./export-section";
import { ImportSection } from "./import-section";
import { DeleteAccountSection } from "./delete-account-section";

export default async function DataSettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Import & export"
        subtitle="Download a personal export of your study types, tags, timings, and preferences, or import a previous RadTempo export."
        className="pb-6"
      />

      <ExportSection />
      <ImportSection />
      <DeleteAccountSection userEmail={user.email} />
    </div>
  );
}
