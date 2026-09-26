/**
 * Shared error types for feature services (`src/features/*`). Server
 * actions and route handlers translate these into user-facing messages;
 * they are never leaked verbatim to the client.
 */

/** The requested row does not exist, or does not belong to the caller. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** An attempt to mutate a record that has already been finalized/immutable. */
export class ImmutableError extends Error {
  constructor(message = "This record can no longer be changed") {
    super(message);
    this.name = "ImmutableError";
  }
}

/** Input failed a domain-level validation rule beyond plain Zod shape checks. */
export class ValidationError extends Error {
  constructor(message = "Invalid input") {
    super(message);
    this.name = "ValidationError";
  }
}
