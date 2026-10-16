/**
 * The auth routes through the real app: the middleware chain, the real error mapper, the shared
 * Postgres double steered statement by statement, and the shared Resend double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, emailControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn, TEST_SESSION_ID } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('POST /api/auth/code', () => {
  test('answers 202 and emails the code', async () => {
    const res = await post(
      '/api/auth/code',
      { email: 'dinda@email.com' },
      { 'cf-connecting-ip': '1.2.3.4' },
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(emailControl.sent).toHaveLength(1);
    expect(emailControl.sent[0]?.subject).toMatch(/^\d{6} adalah kode masuk Kira$/);
    expect(dbControl.queries.some((query) => query.params.includes('1.2.3.4'))).toBe(true);
  });

  test('refuses an address that is not one with a 422', async () => {
    const res = await post('/api/auth/code', { email: 'not-an-email' });

    expect(res.status).toBe(422);
    expect((await res.json()).fields).toEqual({ email: 'invalid_format' });
  });
});

describe('POST /api/auth/verify', () => {
  test('answers 400 when no code is waiting', async () => {
    const res = await post('/api/auth/verify', { email: 'dinda@email.com', code: '381427' });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('AUTH_CODE_INVALID');
  });

  test('signs in end to end with the code that was emailed', async () => {
    let code = '';
    emailControl.send = async (message) => {
      code = message.subject.slice(0, 6);
    };
    await post('/api/auth/code', { email: 'dinda@email.com' });
    const stored = dbControl.queries.find((query) =>
      query.sql.startsWith('insert into "auth_codes"'),
    );
    const codeHash = stored?.params[1];
    dbControl.respond = (query) => {
      if (query.sql.startsWith('select "id", "code_hash"')) {
        return [
          {
            id: 'code-1',
            codeHash,
            attempts: 0,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ];
      }
      if (query.sql.startsWith('update "auth_codes" set "attempts"'))
        return [{ codeHash, attempts: 1 }];
      if (query.sql.startsWith('insert into "users"')) return [{ id: 'user-1', consentedAt: null }];
      return [];
    };

    const res = await post('/api/auth/verify', { email: 'dinda@email.com', code });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsOnboarding).toBe(true);
    expect(body.accessExpiresInSeconds).toBe(900);
    expect(typeof body.accessToken).toBe('string');
  });
});

describe('POST /api/auth/refresh', () => {
  test('answers 401 for an unknown refresh token', async () => {
    const res = await post('/api/auth/refresh', { refreshToken: 'nope' });

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('AUTH_REFRESH_INVALID');
  });

  test('answers a new pair for a live session', async () => {
    dbControl.respond = (query) => {
      if (query.sql.includes('where "sessions"."refresh_token_hash" = $1 limit')) {
        return [
          {
            sessionId: 's1',
            userId: 'u1',
            refreshExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            revokedAt: null,
          },
        ];
      }
      return query.sql.startsWith('update "sessions"') ? [{ id: 's1' }] : [];
    };

    const res = await post('/api/auth/refresh', { refreshToken: 'live' });

    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).toSorted()).toEqual([
      'accessExpiresInSeconds',
      'accessToken',
      'refreshToken',
    ]);
  });
});

describe('POST /api/auth/sign-out', () => {
  test('answers 401 without a session', async () => {
    const res = await post('/api/auth/sign-out');

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('AUTH_UNAUTHENTICATED');
  });

  test('revokes the current session', async () => {
    dbControl.respond = signedIn();

    const res = await post('/api/auth/sign-out', undefined, AUTH_HEADER);

    expect(res.status).toBe(204);
    const revoke = dbControl.queries.at(-1);
    expect(revoke?.sql).toStartWith('update "sessions" set "revoked_at"');
    expect(revoke?.params).toContain(TEST_SESSION_ID);
  });
});
