/**
 * The app as a client sees it: the real middleware chain, the real error mapper (AGENTS.md
 * Rule 21) and the shared test doubles from src/test/preload.ts in place of Postgres.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../app.ts';
import { PROBLEM_TYPE_BASE } from '../lib/errors/problem.ts';
import { dbControl, resetExternalMocks } from '../test/preload.ts';

beforeEach(() => resetExternalMocks());

describe('GET /health', () => {
  test('answers 200 while the database answers', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', database: 'healthy' });
  });

  test('answers a 503 problem when the database does not', async () => {
    dbControl.respond = async () => {
      throw new Error('connection refused');
    };

    const res = await app.request('/health');
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}META_HEALTH_UNHEALTHY`);
    expect(JSON.stringify(body)).not.toContain('connection refused');
  });
});

describe('GET /email/*', () => {
  test('serves the email images from public/email/', async () => {
    const res = await app.request('/email/mark.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  test('answers a missing image with the 404 problem', async () => {
    const res = await app.request('/email/nothing-here.png');

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('the middleware chain', () => {
  test('sends a request id and the security headers on every response', async () => {
    const res = await app.request('/health');

    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  test('allows no browser origin by default', async () => {
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example' } });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('answers an unknown route with a problem carrying the same request id', async () => {
    const res = await app.request('/api/nothing-here', { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('ROUTE_NOT_FOUND');
    expect(body.requestId).toBe(res.headers.get('X-Request-Id'));
  });

  test('refuses an oversized /api body with a 413 problem before reading it', async () => {
    const res = await app.request('/api/anything', {
      method: 'POST',
      body: 'x'.repeat(1_048_577),
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('REQUEST_TOO_LARGE');
  });
});
