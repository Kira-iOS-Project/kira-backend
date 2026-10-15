/**
 * The domain error hierarchy. Services throw these; `problem.ts` turns any of them into an RFC 9457
 * `application/problem+json` response, so a handler never needs a try/catch for one.
 *
 * Adding an error: subclass the base for the status you need in the module's `<module>.errors.ts`,
 * give it a code from `error-codes.ts`, and throw it from the service.
 *
 * The second constructor argument (`internalDetail`) reaches the logs only. `userMessage` is the
 * one text sent to the client, so it never holds an id, a stack or anything internal (Rule 12).
 */

import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorCode } from './error-codes.ts';

/**
 * Concrete rather than `abstract`: an abstract class never runs its own constructor under test, so
 * Bun's function coverage would cap this file below 100% however many subclasses are tested. Its
 * 500 default applies only when it is thrown directly, which nothing should do.
 */
export class DomainError extends Error {
  /** The HTTP status this error maps to. Subclasses override it. */
  readonly statusCode: ContentfulStatusCode = 500;

  /** The stable machine code clients branch on, from the closed `ERROR_CODES` list. */
  readonly code: ErrorCode;

  /** RFC 9457 `detail`: safe to send to the client for this occurrence. */
  readonly userMessage: string;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(internalDetail ? `${userMessage}: ${internalDetail}` : userMessage);
    this.name = new.target.name;
    this.code = code;
    this.userMessage = userMessage;
  }
}

/**
 * Each subclass repeats the constructor on purpose: without it Bun attributes the field override to
 * DomainError and reports that file's functions as half covered.
 */

/** 404: the entity does not exist, or the caller may not know that it does. */
export class NotFoundError extends DomainError {
  override readonly statusCode = 404 as const;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(userMessage, internalDetail, code);
  }
}

/** 400: a business rule refused the input (schema failures are 422, from `validationHook`). */
export class ValidationError extends DomainError {
  override readonly statusCode = 400 as const;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(userMessage, internalDetail, code);
  }
}

/** 403: the caller is known and may not do this. */
export class ForbiddenError extends DomainError {
  override readonly statusCode = 403 as const;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(userMessage, internalDetail, code);
  }
}

/** 409: the state changed under the request (a duplicate, a stale update). */
export class ConflictError extends DomainError {
  override readonly statusCode = 409 as const;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(userMessage, internalDetail, code);
  }
}

/** 503: a dependency is unavailable right now. */
export class ServiceUnavailableError extends DomainError {
  override readonly statusCode = 503 as const;

  constructor(userMessage: string, internalDetail: string | undefined, code: ErrorCode) {
    super(userMessage, internalDetail, code);
  }
}
