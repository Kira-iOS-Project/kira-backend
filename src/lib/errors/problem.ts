/**
 * RFC 9457 `application/problem+json`: the one error envelope (.claude/rules/common/error-codes.md).
 *
 * `handleAppError` (wired as `app.onError` in `src/app.ts`) is the only place a thrown error
 * becomes a response; `handleNotFound` covers a request no route matches, and `validationHook` (the
 * `defaultHook` every router gets from `createRouter`) a request that fails its schema. Each
 * problem's `type` is `PROBLEM_TYPE_BASE` plus its code, and its `title` is fixed per code, so a
 * client resolves a failure by `type` alone. `detail` is a client-safe sentence; what went wrong
 * inside goes to the log line, which carries the same `requestId` as the body.
 */

import { z, type Hook } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../server/factory.ts';
import { logger } from '../server/logger.ts';
import { ERROR_CODES, type ErrorCode } from './error-codes.ts';
import { DomainError } from './errors.ts';

/**
 * The base every problem type is minted from. Installed apps resolve failures by it, so it is set
 * once, before the first release, and never changed. It names this API and need not resolve.
 */
export const PROBLEM_TYPE_BASE = 'https://api-kira.serenitycode.tech/problems/';

const TITLES = {
  VALIDATION_FAILED: 'Validation Failed',
  ROUTE_NOT_FOUND: 'Route Not Found',
  REQUEST_TOO_LARGE: 'Request Too Large',
  REQUEST_TIMEOUT: 'Request Timeout',
  HTTP_ERROR: 'Request Refused',
  INTERNAL_ERROR: 'Internal Server Error',
  META_HEALTH_UNHEALTHY: 'Service Unhealthy',
  AUTH_CODE_RATE_LIMITED: 'Too Many Code Requests',
  AUTH_VERIFY_RATE_LIMITED: 'Too Many Sign-in Tries',
  AUTH_CODE_INVALID: 'Invalid Code',
  AUTH_CODE_EXPIRED: 'Code Expired',
  AUTH_CODE_ATTEMPTS_EXCEEDED: 'Too Many Attempts',
  AUTH_UNAUTHENTICATED: 'Not Signed In',
  AUTH_REFRESH_INVALID: 'Session Ended',
  EMAIL_DELIVERY_FAILED: 'Email Not Sent',
  ACCOUNT_EXPORT_RATE_LIMITED: 'Export Recently Emailed',
  SCORE_NOT_AVAILABLE: 'Score Not Available',
  PAYOFF_EXTRA_TOO_HIGH: 'Extra Payment Too High',
  PAYOFF_NOTHING_TO_PLAN: 'Nothing To Plan',
  PAYOFF_PLAN_NOT_FOUND: 'No Active Plan',
  PAYOFF_DEBT_NOT_FOUND: 'Debt Account Not Found',
  PAYOFF_PAYMENT_TOO_HIGH: 'Payment Too High',
  PAYOFF_PAYMENT_ALREADY_RECORDED: 'Payment Already Recorded',
  CHAT_AI_DISABLED: 'Kira AI Is Off',
  CHAT_MESSAGE_NOT_FOUND: 'Message Not Found',
  CHAT_DRAFTS_NOT_PENDING: 'Drafts Already Settled',
  PLAN_FEATURE_UNAVAILABLE: 'Not in Your Plan',
  RECEIPT_TOTAL_MISMATCH: 'Receipt Total Mismatch',
  TRANSACTION_NOT_FOUND: 'Transaction Not Found',
  TRANSACTION_BATCH_NOT_FOUND: 'Batch Not Found',
  TRANSACTION_UNDO_EXPIRED: 'Undo Window Passed',
  IMPORT_NOT_FOUND: 'Import Not Found',
  IMPORT_RANGE_TOO_LONG: 'Import Range Too Long',
  IMPORT_ROW_UNKNOWN: 'Unknown Import Row',
  SUBSCRIPTION_NOT_FOUND: 'No Subscription',
  SUBSCRIPTION_NOT_CANCELLABLE: 'Subscription Not Cancellable',
  SUBSCRIPTION_NOT_PAID: 'Subscription Has No Payment',
  SCHOLARSHIP_NOT_ELIGIBLE: 'Not Eligible',
  SCHOLARSHIP_APPLICATION_NOT_FOUND: 'Application Not Found',
  SCHOLARSHIP_DEBT_EMERGENCY_REQUIRED: 'Mode Darurat Utang Required',
  COMMUNITY_GROUP_NOT_FOUND: 'Group Not Found',
  COMMUNITY_LINK_UNAVAILABLE: 'Group Link Unavailable',
  COMMUNITY_PRODUCT_NOT_FOUND: 'Product Not Found',
  COMMUNITY_REPORT_DUPLICATE: 'Group Already Reported',
  COMMUNITY_RULES_NOT_ACCEPTED: 'Community Rules Not Accepted',

  CARE_CHECK_IN_NOT_FOUND: 'Check-in Not Found',
  CARE_SAFETY_PLAN_NOT_FOUND: 'Safety Plan Not Found',
} as const satisfies Record<ErrorCode, string>;

/** An `HTTPException` comes from middleware that knows only a status (the body limit, the
   timeout), so its code and its client-safe detail are chosen here from that status. */
const HTTP_EXCEPTIONS: Readonly<Partial<Record<number, { code: ErrorCode; detail: string }>>> = {
  413: { code: 'REQUEST_TOO_LARGE', detail: 'The request body is larger than this API accepts.' },
  504: { code: 'REQUEST_TIMEOUT', detail: 'The request took longer than its time budget.' },
};

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ErrorCode;
  requestId?: string;
  fields?: Record<string, string>;
};

/** Unset only when a handler runs without `requestId()` in front of it, which is a unit test. */
function requestIdOf(c: Context): string | undefined {
  const id: unknown = c.get('requestId');
  return typeof id === 'string' ? id : undefined;
}

function problemOf(c: Context, status: number, code: ErrorCode, detail: string): Problem {
  const requestId = requestIdOf(c);
  return {
    type: `${PROBLEM_TYPE_BASE}${code}`,
    title: TITLES[code],
    status,
    detail,
    instance: c.req.path,
    code,
    ...(requestId ? { requestId } : {}),
  };
}

function respond(c: Context, problem: Problem) {
  return c.body(JSON.stringify(problem), problem.status as ContentfulStatusCode, {
    'Content-Type': 'application/problem+json',
  });
}

/** What every error log line carries, so one search for the id a user quotes finds it. */
function traceOf(c: Context, code: ErrorCode, status: number) {
  return { requestId: requestIdOf(c), code, status, method: c.req.method, path: c.req.path };
}

/** Lib: handleAppError
 * Maps any thrown error to problem+json: a `DomainError` keeps its status and code, an
 * `HTTPException` its status, and anything else becomes an opaque 500 that leaks nothing.
 */
export function handleAppError(err: Error, c: Context) {
  if (err instanceof DomainError) {
    const trace = traceOf(c, err.code, err.statusCode);
    if (err.statusCode >= 500) logger.error({ err, ...trace }, err.message);
    else logger.warn(trace, err.message);
    return respond(c, problemOf(c, err.statusCode, err.code, err.userMessage));
  }

  if (err instanceof HTTPException) {
    const known = HTTP_EXCEPTIONS[err.status];
    const code = known?.code ?? 'HTTP_ERROR';
    const trace = traceOf(c, code, err.status);
    if (err.status >= 500) logger.error({ err, ...trace }, err.message);
    else logger.warn(trace, err.message);
    const detail = known?.detail ?? 'The request could not be processed.';
    return respond(c, problemOf(c, err.status, code, detail));
  }

  logger.error({ err, ...traceOf(c, 'INTERNAL_ERROR', 500) }, 'Unhandled error');
  return respond(
    c,
    problemOf(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.'),
  );
}

/** Lib: handleNotFound
 * The problem for a request no route matches, so even Hono's own 404 is problem+json.
 */
export function handleNotFound(c: Context) {
  return respond(
    c,
    problemOf(c, 404, 'ROUTE_NOT_FOUND', `No route matches ${c.req.method} ${c.req.path}.`),
  );
}

/** Lib: validationHook
 * The routers' `defaultHook`: a schema failure becomes a 422 whose `fields` name each failing
 * field once, by its first Zod issue code, and never echo the value (it may be a secret).
 */
export const validationHook: Hook<unknown, AppEnv, string, Response | undefined> = (result, c) => {
  if (result.success) return undefined;
  const { issues } = result.error;
  logger.warn({ ...traceOf(c, 'VALIDATION_FAILED', 422), issues }, 'Request validation failed');
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[issue.path.join('.') || '_'] ??= issue.code;
  }
  return respond(c, {
    ...problemOf(c, 422, 'VALIDATION_FAILED', 'Request validation failed.'),
    fields,
  });
};

/** The body's shape, for the OpenAPI document only: the handlers above build the JSON directly.
   `code` keeps its enum inline and `type` publishes the base, which is what clients read. */
const problemSchema = z
  .object({
    type: z.string().openapi({
      format: 'uri',
      'x-problem-type-base': PROBLEM_TYPE_BASE,
      example: `${PROBLEM_TYPE_BASE}ROUTE_NOT_FOUND`,
    }),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
    code: z.enum(ERROR_CODES),
    requestId: z.string().optional(),
    fields: z.record(z.string(), z.string()).optional(),
  })
  .openapi('Problem');

const DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'A business rule refused the request',
  401: 'No valid session',
  403: 'Action not allowed',
  404: 'Resource not found',
  409: 'Resource conflict',
  413: 'Request body exceeds the size limit',
  422: 'Request schema validation failed',
  429: 'Too many requests',
  503: 'A dependency is unavailable',
  504: 'The request exceeded its time budget',
};

/** Lib: errorResponses
 * The problem+json entries of a route's `responses` map, one per status its service can raise
 * (Rule 13): `responses: { 200: {...}, ...errorResponses(404, 422) }`.
 */
type ProblemResponse = {
  content: { 'application/problem+json': { schema: typeof problemSchema } };
  description: string;
};

export function errorResponses(...statuses: number[]): Record<string, ProblemResponse> {
  const problem = { content: { 'application/problem+json': { schema: problemSchema } } };
  return {
    ...Object.fromEntries(
      statuses.map((status) => [
        status,
        { ...problem, description: DESCRIPTIONS[status] ?? 'Error' },
      ]),
    ),
    /** Any status a route does not list (a 500, the 504 budget, the 413 body limit) is a problem too,
       so a generated client decodes its code and request id instead of dropping the body. */
    default: {
      ...problem,
      description: 'Any other problem: a server failure, a timeout, a body too large',
    },
  };
}
