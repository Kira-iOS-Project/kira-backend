/**
 * POST /api/payoff/simulate through the real app: the session gate, request validation, the error
 * mapper and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { DINDA_OPEN } from './helpers.ts';

beforeEach(() => resetExternalMocks());

/** Dinda: 7,5 juta income and 5,66 juta spent, so 1,84 juta is left whatever day the suite runs. */
function dinda(query: FakeQuery): FakeRow[] {
  if (query.sql.includes('"display_name"')) {
    return [
      {
        displayName: 'Dinda',
        hideBalances: false,
        focus: FOCUS.trackSpending,
        paydayDay: 25,
        paydayEndOfMonth: false,
        completedAt: new Date().toISOString(),
        income: 7_500_000,
        essential: 4_200_000,
        emergencyFund: 4_800_000,
      },
    ];
  }
  if (query.sql.includes('from "transactions"')) {
    return [{ income: 0, expense: 5_660_000, count: 12 }];
  }
  if (query.sql.includes('from "debt_accounts"')) return DINDA_OPEN;
  return [];
}

function simulate(body: unknown) {
  return app.request('/api/payoff/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    body: JSON.stringify(body),
  });
}

describe('POST /api/payoff/simulate', () => {
  test('answers 401 without a session', async () => {
    const res = await app.request('/api/payoff/simulate', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('answers the plan, with the extra payment defaulting to 0', async () => {
    dbControl.respond = signedIn(dinda);
    const res = await simulate({ method: 'snowball' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      method: 'snowball',
      extraPayment: 0,
      maxExtraPayment: 1_840_000,
      monthlyBudget: 500_000,
    });
    expect(body.accounts).toHaveLength(2);
    expect(body.productive).toHaveLength(1);
  });

  test('answers 400 PAYOFF_EXTRA_TOO_HIGH above the money left', async () => {
    dbControl.respond = signedIn(dinda);
    const res = await simulate({ method: 'avalanche', extraPayment: 1_840_001 });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PAYOFF_EXTRA_TOO_HIGH');
  });

  test('answers 422 for an unknown method or a negative extra payment', async () => {
    dbControl.respond = signedIn(dinda);

    expect((await simulate({ method: 'random' })).status).toBe(422);
    expect((await simulate({ method: 'snowball', extraPayment: -1 })).status).toBe(422);
  });
});
