import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  disabledAt: Date | null;
  onboardedAt: Date | null;
};

async function getCurrentSession() {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
}

/**
 * Resolves the current authenticated, non-disabled user from the request
 * session, or throws `UnauthorizedError`. Use in server actions, route
 * handlers, and server components that require a signed-in user.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const user = session.user as unknown as CurrentUser & {
    disabledAt?: string | Date | null;
  };

  if (user.disabledAt) {
    throw new ForbiddenError("Account disabled");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabledAt: user.disabledAt ? new Date(user.disabledAt) : null,
    onboardedAt: user.onboardedAt ? new Date(user.onboardedAt) : null,
  };
}

/**
 * Like `requireUser`, but also requires the ADMIN role. Throws
 * `ForbiddenError` for a signed-in non-admin user.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError("Admin role required");
  }
  return user;
}

/**
 * Non-throwing variant for pages/components that render differently based
 * on auth state (e.g. the sidebar).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
