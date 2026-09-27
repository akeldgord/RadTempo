"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESTORE_CONFIRMATION_PHRASE = "RESTORE";
const MIN_PASSPHRASE_LENGTH = 12;

function BackupForm() {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const passphrasesMatch = passphrase === confirmPassphrase;
  const passphraseLongEnough = passphrase.length >= MIN_PASSPHRASE_LENGTH;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!passphraseLongEnough) {
      setError(
        `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
      );
      return;
    }
    if (!passphrasesMatch) {
      setError("Passphrases do not match.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Backup failed.");
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "radtempo-backup.dump.age";

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setPassphrase("");
      setConfirmPassphrase("");
    } catch {
      setError("Backup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Anyone with the backup file and this passphrase can read all data in it.
        Store them separately.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-passphrase">Passphrase</Label>
          <Input
            id="backup-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            minLength={MIN_PASSPHRASE_LENGTH}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="backup-passphrase-confirm">Confirm passphrase</Label>
          <Input
            id="backup-passphrase-confirm"
            type="password"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            minLength={MIN_PASSPHRASE_LENGTH}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating backup..." : "Download backup"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function RestoreForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    file != null &&
    passphrase.length > 0 &&
    confirmation === RESTORE_CONFIRMATION_PHRASE;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !file) return;

    setPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("passphrase", passphrase);
      formData.set("confirmation", confirmation);
      formData.set("file", file);

      const response = await fetch("/api/admin/restore", {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.error ?? "Restore failed.");
        return;
      }

      // Restore wipes all sessions, including this one.
      router.push("/login");
    } catch {
      setError("Restore failed.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Restore from backup
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-danger bg-danger/5 p-4"
    >
      <p className="text-sm text-foreground">
        This replaces all current data with the contents of the backup and signs
        everyone out, including you. This cannot be undone.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="restore-file">Backup file</Label>
        <input
          id="restore-file"
          type="file"
          accept=".age"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-foreground"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="restore-passphrase">Passphrase</Label>
        <Input
          id="restore-passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="restore-confirmation">
          Type <span className="font-mono font-semibold">RESTORE</span> to
          confirm
        </Label>
        <Input
          id="restore-confirmation"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="danger"
          size="sm"
          disabled={!canSubmit || pending}
        >
          {pending ? "Restoring..." : "Restore and overwrite all data"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BackupSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Encrypted with age (scrypt passphrase mode) via pg_dump/pg_restore.
          See docs/backup-restore.md for the manual CLI workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Create backup
          </h3>
          <BackupForm />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Restore backup
          </h3>
          <RestoreForm />
        </div>
      </CardContent>
    </Card>
  );
}
