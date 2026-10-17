/** GET and PUT /api/budgets/current through the real app, the session gate and the Postgres double. */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../../lib/constants/money.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

function put(body: unknown) {
  return app.request('/api/budgets/current', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    body: JSON.stringify(body),
  });
}

const VALID = {
  allocations: [{ category: EXPENSE_CATEGORY.food, amount: 1_800_000 }],
  payday: { day: 25, endOfMonth: false },
};

describe('GET /api/budgets/current', () => {
  test('answers 401 without a session, and the empty budget before Atur Budget', async () => {
    expect((await app.request('/api/budgets/current')).status).toBe(401);

    dbControl.respond = signedIn();
    const res = await app.request('/api/budgets/current', { headers: AUTH_HEADER });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      configured: false,
      income: 0,
      allocations: [],
      averages: [],
      instalmentsMonthly: 0,
      goalPost: null,
      payday: { requested: { day: null, endOfMonth: false } },
    });
  });
});

describe('PUT /api/budgets/current', () => {
  test('saves the limits and the payday, then answers the budget', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "budgets"') ? [{ allocations: VALID.allocations }] : [],
    );
    const res = await put(VALID);

    expect(res.status).toBe(200);
    expect((await res.json()).configured).toBe(true);
    expect(
      dbControl.queries.some((query) => query.sql.startsWith('update "users" set "payday_day"')),
    ).toBe(true);
  });

  test('answers 422 to a repeated category, an amount out of range or a bad payday', async () => {
    dbControl.respond = signedIn();
    const food = (amount: number) => ({ category: EXPENSE_CATEGORY.food, amount });
    for (const body of [
      { ...VALID, allocations: [food(1), food(2)] },
      { ...VALID, allocations: [food(-1)] },
      { ...VALID, allocations: [{ category: INCOME_CATEGORY.salary, amount: 1 }] },
      { ...VALID, payday: { day: 32, endOfMonth: false } },
      { allocations: [] },
    ]) {
      const res = await put(body);
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    }
  });

  test('answers 401 without a session', async () => {
    expect((await app.request('/api/budgets/current', { method: 'PUT' })).status).toBe(401);
  });
});
