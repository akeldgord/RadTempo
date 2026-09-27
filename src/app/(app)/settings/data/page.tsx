import { requireUser } from "@/server/auth-helpers";
import { ExportSection } from "./export-section";
import { ImportSection } from "./import-section";
import { DeleteAccountSection } from "./delete-account-section";

export default async function DataSettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Import &amp; export
        </h1>
        <p className="text-sm text-muted">
          Download a personal export of your study types, tags, timings, and
          preferences, or import a previous RadTempo export.
        </p>
      </div>

      <ExportSection />
      <ImportSection />
      <DeleteAccountSection userEmail={user.email} />
    </div>
  );
}
