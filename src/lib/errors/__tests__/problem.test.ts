import { describe, expect, spyOn, test } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../../server/logger.ts';
import { ConflictError, ServiceUnavailableError } from '../errors.ts';
import {
  errorResponses,
  handleAppError,
  handleNotFound,
  PROBLEM_TYPE_BASE,
  validationHook,
} from '../problem.ts';

function contextFor(path = '/api/things', method = 'GET'): Context {
  return new Context(new Request(`http://localhost${path}`, { method }), { env: {}, path });
}

/** What the router hands its hook: the parse result plus the part of the request it validated. */
function hookInput<T>(result: z.ZodSafeParseResult<T>) {
  return { ...result, target: 'json' as const };
}

describe('PROBLEM_TYPE_BASE', () => {
  test('is an absolute https base ending in /', () => {
    const url = new URL(PROBLEM_TYPE_BASE);

    expect(url.protocol).toBe('https:');
    expect(url.href).toBe(PROBLEM_TYPE_BASE);
    expect(PROBLEM_TYPE_BASE.endsWith('/')).toBe(true);
  });
});

describe('handleAppError', () => {
  test('serializes a DomainError as problem+json typed by its code', async () => {
    const err = new ConflictError('Already there.', 'unique violation on 42', 'HTTP_ERROR');

    const res = handleAppError(err, contextFor('/api/things/42', 'PUT'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}HTTP_ERROR`,
      title: 'Request Refused',
      status: 409,
      detail: 'Already there.',
      instance: '/api/things/42',
      code: 'HTTP_ERROR',
    });
    expect(JSON.stringify(body)).not.toContain('unique violation');
  });

  test('logs a 5xx DomainError at error level and a 4xx one at warn', () => {
    const error = spyOn(logger, 'error');
    const warn = spyOn(logger, 'warn');
    try {
      handleAppError(
        new ServiceUnavailableError('Down.', undefined, 'META_HEALTH_UNHEALTHY'),
        contextFor(),
      );
      handleAppError(new ConflictError('Taken.', undefined, 'HTTP_ERROR'), contextFor());

      expect(error).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  test.each([
    [413, 'REQUEST_TOO_LARGE', 'Request Too Large'],
    [504, 'REQUEST_TIMEOUT', 'Request Timeout'],
    [418, 'HTTP_ERROR', 'Request Refused'],
  ] as const)('gives an HTTPException %i the code %s', async (status, code, title) => {
    const err = new HTTPException(status, { message: 'internal reason' });

    const res = handleAppError(err, contextFor());
    const body = await res.json();

    expect(res.status).toBe(status);
    expect(body).toMatchObject({ type: `${PROBLEM_TYPE_BASE}${code}`, title, code });
    expect(body.detail).not.toContain('internal reason');
  });

  test('logs a 5xx HTTPException at error level and a 4xx one at warn', () => {
    const error = spyOn(logger, 'error');
    const warn = spyOn(logger, 'warn');
    try {
      handleAppError(new HTTPException(504), contextFor());
      handleAppError(new HTTPException(413), contextFor());

      expect(error).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  test('turns any other error into an opaque 500 that names nothing inside', async () => {
    const res = handleAppError(new Error('pool exhausted at db.ts:12'), contextFor());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.title).toBe('Internal Server Error');
    expect(body).not.toHaveProperty('requestId');
    expect(JSON.stringify(body)).not.toContain('pool exhausted');
  });

  test('carries the request id, so a quoted reference finds the log line', async () => {
    const c = contextFor();
    c.set('requestId', 'req-123');

    const body = await handleAppError(new Error('boom'), c).json();

    expect(body.requestId).toBe('req-123');
  });
});

describe('handleNotFound', () => {
  test('answers a route-not-found problem naming the method and path', async () => {
    const res = handleNotFound(contextFor('/nope', 'DELETE'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}ROUTE_NOT_FOUND`);
    expect(body.detail).toBe('No route matches DELETE /nope.');
  });
});

describe('validationHook', () => {
  test('lets a valid request through', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 'Kira' });

    expect(validationHook(hookInput(result), contextFor())).toBeUndefined();
  });

  test('answers 422 naming each field by its first issue, never its value', async () => {
    const result = z.object({ pin: z.string().min(6).regex(/^\d+$/) }).safeParse({ pin: 'ab' });

    const res = validationHook(hookInput(result), contextFor('/api/pin', 'POST')) as Response;
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fields).toEqual({ pin: 'too_small' });
    expect(JSON.stringify(body)).not.toContain('"ab"');
  });

  test('names a root-level issue `_`', async () => {
    const res = validationHook(hookInput(z.string().safeParse(7)), contextFor()) as Response;

    expect((await res.json()).fields).toEqual({ _: 'invalid_type' });
  });
});

describe('errorResponses', () => {
  test('builds one problem+json entry per status, with a fallback description', () => {
    const responses = errorResponses(404, 418);

    expect(Object.keys(responses)).toEqual(['404', '418']);
    expect(responses[404]?.description).toBe('Resource not found');
    expect(responses[418]?.description).toBe('Error');
  });
});
