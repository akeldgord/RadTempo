"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { registerAction, type RegisterResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: RegisterResult | null = null;

export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/login");
    }
  }, [state, router]);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <input
            type="hidden"
            name="inviteToken"
            defaultValue={inviteToken ?? ""}
          />
          {state && !state.ok && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="text-sm text-primary">
              Account created. Redirecting to sign in...
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
