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
  /** Raised by the platform rather than a module: request shape, routing, limits, and the
     catch-all for a bug. `problem.ts` assigns these. */
  'VALIDATION_FAILED',
  'ROUTE_NOT_FOUND',
  'REQUEST_TOO_LARGE',
  'REQUEST_TIMEOUT',
  'HTTP_ERROR',
  'INTERNAL_ERROR',

  'META_HEALTH_UNHEALTHY',

  /** Sign-in with an email and a one-time code (ONB-05 to ONB-07b, ONB-15). */
  'AUTH_CODE_RATE_LIMITED',
  'AUTH_CODE_INVALID',
  'AUTH_CODE_EXPIRED',
  'AUTH_CODE_ATTEMPTS_EXCEEDED',
  'AUTH_UNAUTHENTICATED',
  'AUTH_REFRESH_INVALID',

  /** Transactional email through Resend. */
  'EMAIL_DELIVERY_FAILED',

  /** The Kira Score before the health check has been answered. */
  'SCORE_NOT_AVAILABLE',

  /** Catat: chat, receipts, voice, manual entries and the transaction history. */
  'CHAT_AI_DISABLED',
  'CHAT_MESSAGE_NOT_FOUND',
  'CHAT_DRAFTS_NOT_PENDING',
  'PLAN_FEATURE_UNAVAILABLE',
  'RECEIPT_TOTAL_MISMATCH',
  'TRANSACTION_NOT_FOUND',
  'TRANSACTION_BATCH_NOT_FOUND',
  'TRANSACTION_UNDO_EXPIRED',
  'IMPORT_NOT_FOUND',
  'IMPORT_RANGE_TOO_LONG',
  'IMPORT_ROW_UNKNOWN',

  /** Plans, the simulated billing and Beasiswa Kira. */
  'SUBSCRIPTION_NOT_FOUND',
  'SUBSCRIPTION_NOT_CANCELLABLE',
  'SCHOLARSHIP_NOT_ELIGIBLE',
  'SCHOLARSHIP_APPLICATION_NOT_FOUND',

  /** Terhubung: community groups, their rules and reports, and Etalase. */
  'COMMUNITY_GROUP_NOT_FOUND',
  'COMMUNITY_PRODUCT_NOT_FOUND',
  'COMMUNITY_REPORT_DUPLICATE',
  'COMMUNITY_RULES_NOT_ACCEPTED',

  /** Kira Peduli: check-ins and the safety plan (PED-05, PED-06, PED-10). */
  'CARE_CHECK_IN_NOT_FOUND',
  'CARE_SAFETY_PLAN_NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
