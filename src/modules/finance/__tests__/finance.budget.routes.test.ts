import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('current budget route', () => {
  test('requires a session and returns the current owner-scoped budget', async () => {
    expect((await app.request('/api/budgets/current')).status).toBe(401);
    expect((await app.request('/api/budgets/current/edit')).status).toBe(401);
    expect(
      (
        await app.request('/api/budgets/current', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            income: 100_000,
            allocations: [],
            payday: { type: 'endOfMonth' },
          }),
        })
      ).status,
    ).toBe(401);

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

    const editResponse = await app.request('/api/budgets/current/edit', { headers: AUTH_HEADER });
    expect(editResponse.status).toBe(200);
    expect(await editResponse.json()).toMatchObject({ averagePeriods: 3, averages: [] });
  });

  test('validates and saves the budget edit contract', async () => {
    const saved = {
      income: 100_000,
      allocations: [{ category: EXPENSE_CATEGORY.bills, amount: 120_000 }],
      payday: { type: 'day', day: 31 },
    };
    dbControl.respond = signedIn((query) => (query.sql.includes('from "budgets"') ? [saved] : []));
    const response = await app.request('/api/budgets/current', {
      method: 'PUT',
      headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
      body: JSON.stringify(saved),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ configured: true, overAllocated: true });

    const invalid = await app.request('/api/budgets/current', {
      method: 'PUT',
      headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
      body: JSON.stringify({ ...saved, payday: { type: 'day', day: 32 } }),
    });
    expect(invalid.status).toBe(422);
  });
});
