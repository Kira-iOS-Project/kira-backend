import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('current budget route', () => {
  test('requires a session and returns the current owner-scoped budget', async () => {
    expect((await app.request('/api/budgets/current')).status).toBe(401);

    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/budgets/current', { headers: AUTH_HEADER });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: false,
      income: 0,
      allocations: [],
      overAllocated: false,
      goalPosts: [],
      payday: {
        requested: { type: 'endOfMonth' },
      },
    });
  });
});
