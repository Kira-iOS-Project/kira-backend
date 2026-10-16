import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('GET /api/usage', () => {
  test('answers the usage of the signed-in person', async () => {
    dbControl.respond = signedIn(inOrder([], [{ aiMessages: 4, receipts: 1, voiceSeconds: 0 }]));

    const res = await app.request('/api/usage', { headers: AUTH_HEADER });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiMessages).toEqual({ used: 4, limit: 30 });
    expect(body.receipts).toEqual({ used: 1, limit: 10 });
  });

  test('answers 401 without a session', async () => {
    const res = await app.request('/api/usage');

    expect(res.status).toBe(401);
  });
});
