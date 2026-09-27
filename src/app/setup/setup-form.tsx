"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setupAction, type SetupResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: SetupResult | null = null;

export function SetupForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setupAction,
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
          {state && !state.ok && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Creating admin account..." : "Create admin account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
