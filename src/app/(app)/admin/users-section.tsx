"use client";

import { useActionState, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUserSummary, PendingInvite } from "@/features/admin/users";
import {
  createUserAction,
  inviteUserAction,
  resetCredentialsAction,
  revokeInviteAction,
  setUserDisabledAction,
  setUserRoleAction,
  deleteUserAction,
} from "@/features/admin/actions";
import { TypedConfirmForm } from "./typed-confirm-form";

function OneTimeSecret({
  label,
  value,
  onDismiss,
}: {
  label: string;
  value: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-primary bg-accent p-3"
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <code className="select-all rounded bg-card px-2 py-1 text-sm">
        {value}
      </code>
      <p className="text-xs text-muted">
        This is shown once and cannot be retrieved again. Share it securely.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
        Done
      </Button>
    </div>
  );
}

function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const [dismissed, setDismissed] = useState(false);

  if (state?.ok && !dismissed) {
    return (
      <OneTimeSecret
        label={`Temporary password for ${state.email}`}
        value={state.temporaryPassword}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-name">Name</Label>
        <Input id="new-user-name" name="name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-email">Email</Label>
        <Input id="new-user-email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-role">Role</Label>
        <select
          id="new-user-role"
          name="role"
          defaultValue="USER"
          className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
        >
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create user"}
      </Button>
    </form>
  );
}

function InviteForm({ appUrl }: { appUrl: string }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email (optional)</Label>
        <Input id="invite-email" name="email" type="email" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating invite..." : "Create invite"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div className="w-full rounded-md border border-primary bg-accent p-3 text-sm">
          <p className="font-medium text-foreground">
            Invite link{state.emailed ? " (also emailed)" : ""}:
          </p>
          <code className="select-all break-all">{state.link}</code>
        </div>
      )}
      <input type="hidden" name="appUrl" value={appUrl} />
    </form>
  );
}

function RoleToggle({
  user,
  currentAdminId,
}: {
  user: AdminUserSummary;
  currentAdminId: string;
}) {
  const [, formAction, pending] = useActionState(setUserRoleAction, null);
  const nextRole = user.role === "ADMIN" ? "USER" : "ADMIN";

  if (user.role === "ADMIN" && user.id === currentAdminId) {
    // Demoting yourself when you might be the last admin is guarded
    // server-side too, but a typed confirmation makes the risk visible.
    return (
      <TypedConfirmForm
        action={setUserRoleAction}
        hidden={{ userId: user.id, role: "USER" }}
        confirmPhrase="DEMOTE"
        triggerLabel="Demote to user"
        submitLabel="Demote"
        description="You are demoting your own admin account."
      />
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="role" value={nextRole} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending
          ? "Working..."
          : nextRole === "ADMIN"
            ? "Promote to admin"
            : "Demote to user"}
      </Button>
    </form>
  );
}

function DisableToggle({ user }: { user: AdminUserSummary }) {
  const [, formAction, pending] = useActionState(setUserDisabledAction, null);
  const nextDisabled = user.disabledAt == null;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="disabled" value={String(nextDisabled)} />
      <Button
        type="submit"
        variant={nextDisabled ? "danger" : "secondary"}
        size="sm"
        disabled={pending}
      >
        {pending ? "Working..." : nextDisabled ? "Disable" : "Enable"}
      </Button>
    </form>
  );
}

function ResetCredentials({ user }: { user: AdminUserSummary }) {
  const [secret, setSecret] = useState<string | null>(null);

  if (secret) {
    return (
      <OneTimeSecret
        label={`New temporary password for ${user.email}`}
        value={secret}
        onDismiss={() => setSecret(null)}
      />
    );
  }

  return (
    <TypedConfirmForm
      action={resetCredentialsAction}
      hidden={{ userId: user.id }}
      confirmPhrase="RESET"
      triggerLabel="Reset credentials"
      submitLabel="Reset"
      variant="secondary"
      description="Generates a new temporary password and signs this user out everywhere."
      onSuccess={(result) => setSecret(result.temporaryPassword)}
    />
  );
}

function DeleteUser({
  user,
  currentAdminId,
}: {
  user: AdminUserSummary;
  currentAdminId: string;
}) {
  if (user.id === currentAdminId) return null;

  return (
    <TypedConfirmForm
      action={deleteUserAction}
      hidden={{ userId: user.id }}
      confirmPhrase="DELETE"
      triggerLabel="Delete"
      submitLabel="Delete permanently"
      description={`Permanently deletes ${user.email} and all of their data.`}
    />
  );
}

function RevokeInvite({ invite }: { invite: PendingInvite }) {
  const [, formAction, pending] = useActionState(revokeInviteAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="inviteId" value={invite.id} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Revoking..." : "Revoke"}
      </Button>
    </form>
  );
}

export function UsersSection({
  users,
  invites,
  currentAdminId,
  appUrl,
}: {
  users: AdminUserSummary[];
  invites: PendingInvite[];
  currentAdminId: string;
  appUrl: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Account metadata only. No user&apos;s performance or timing data is
          ever shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Create user</h3>
          <CreateUserForm />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Invite user</h3>
          <InviteForm appUrl={appUrl} />
        </div>

        {invites.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Pending invites
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Email
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-border">
                    <td className="py-2 pr-4">{invite.email ?? "Any email"}</td>
                    <td className="py-2 pr-4">
                      {invite.expiresAt.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <RevokeInvite invite={invite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">All users</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Email
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Role
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Created
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Last session
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border align-top">
                  <td className="py-2 pr-4">{user.email}</td>
                  <td className="py-2 pr-4">{user.name}</td>
                  <td className="py-2 pr-4">{user.role}</td>
                  <td className="py-2 pr-4">
                    {user.createdAt.toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4">
                    {user.lastSessionAt
                      ? user.lastSessionAt.toLocaleString()
                      : "Never"}
                  </td>
                  <td className="py-2 pr-4">
                    {user.disabledAt ? "Disabled" : "Active"}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <RoleToggle user={user} currentAdminId={currentAdminId} />
                      <DisableToggle user={user} />
                      <ResetCredentials user={user} />
                      <DeleteUser user={user} currentAdminId={currentAdminId} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
