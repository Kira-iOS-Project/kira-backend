/**
 * Every machine code this API can put in an error body, in one closed list.
 *
 * The app turns a code into copy, and a code it has no row for reaches people as a generic
 * failure. `DomainError` takes an `ErrorCode`, so an unlisted code fails `tsc`, and the list is
 * published as the `Problem.code` enum in openapi.json, where the iOS client reads it.
 *
 * Adding a code: add it here, throw it, run `bun run spec:export`, then map it in the app with its
 * copy. `error-codes.test.ts` fails on a listed code nothing raises.
 */
export const ERROR_CODES = [
  /* Raised by the platform rather than a module: request shape, routing, limits, and the
     catch-all for a bug. `problem.ts` assigns these. */
  'VALIDATION_FAILED',
  'ROUTE_NOT_FOUND',
  'REQUEST_TOO_LARGE',
  'REQUEST_TIMEOUT',
  'HTTP_ERROR',
  'INTERNAL_ERROR',

  'META_HEALTH_UNHEALTHY',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
