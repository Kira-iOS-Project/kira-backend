import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('bill list route', () => {
  test('requires a session and returns the owner schedule', async () => {
    expect((await app.request('/api/bills')).status).toBe(401);

    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/bills', { headers: AUTH_HEADER });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  });
});
