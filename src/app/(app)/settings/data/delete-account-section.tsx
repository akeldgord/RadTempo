"use client";

import { useState } from "react";
import { deleteAccountAction } from "@/features/account/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteAccountSection({ userEmail }: { userEmail: string }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmEmail === userEmail;

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    const formData = new FormData();
    formData.set("confirmEmail", confirmEmail);
    const result = await deleteAccountAction(formData);
    // A successful delete redirects server-side and never returns here.
    setDeleting(false);
    if (result && !result.ok) {
      setError(result.error);
      setOpen(false);
    }
  }

  return (
    <Card id="delete-account" className="border-danger/40">
      <CardHeader>
        <CardTitle className="text-danger">Delete my account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <p className="text-sm text-muted">
          This permanently deletes your study types, timed cases, tags,
          preferences, and achievements. This cannot be undone from within
          RadTempo. Instance backups made before deletion may still retain a
          copy of your data until they naturally expire or are replaced by a
          later backup.
        </p>

        <div className="flex flex-col gap-1.5 max-w-sm">
          <Label htmlFor="confirm-email">
            Type your account email ({userEmail}) to confirm
          </Label>
          <Input
            id="confirm-email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <AlertDialog open={open} onOpenChange={setOpen}>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!canDelete}
            onClick={() => setOpen(true)}
            className="self-start"
          >
            Delete my account
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your RadTempo data and signs you out.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
