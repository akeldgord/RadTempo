/**
 * Small shared helper for `'use server'` action files: a uniform
 * `{ok:true,data}|{ok:false,error}` result shape, and a single place that
 * decides which error messages are safe to send to the client.
 */

import { ForbiddenError, UnauthorizedError } from "@/server/auth-helpers";
import {
  ImmutableError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

const KNOWN_ERRORS = [
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ImmutableError,
  ValidationError,
];

/** Converts a thrown error into a client-safe `ActionResult`. Known domain
 * errors surface their own message; anything else is logged and replaced
 * with a generic message so internals never leak to the client. */
export function toActionError<T>(
  error: unknown,
  fallbackMessage: string,
): ActionResult<T> {
  for (const ErrorClass of KNOWN_ERRORS) {
    if (error instanceof ErrorClass) {
      return { ok: false, error: error.message };
    }
  }
  console.error(fallbackMessage, error);
  return { ok: false, error: fallbackMessage };
}
