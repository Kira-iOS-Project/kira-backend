/**
 * Rencanaku through the real app: making the plan, reading it, moving its focus and marking a
 * payment, with the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';
import { ID_A, ID_B } from './helpers.ts';
import { call, planned } from './routes-fixtures.ts';

beforeEach(() => resetExternalMocks());

const PAY = '00000000-0000-4000-8000-0000000000f1';

describe('Rencanaku', () => {
  test('answers 401 without a session', async () => {
    for (const [method, path] of [
      ['POST', '/api/payoff/plans'],
      ['GET', '/api/payoff/plans/active'],
      ['PATCH', '/api/payoff/plans/active'],
      ['POST', `/api/debts/${ID_A}/payments`],
    ] as const) {
      expect((await app.request(path, { method })).status).toBe(401);
    }
  });

  test('POST /api/payoff/plans makes the plan and answers 201', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('POST', '/api/payoff/plans', { method: 'snowball', extraPayment: 0 });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Paylater A',
      'Paylater B',
      'Cicilan Motor',
    ]);
  });

  test('POST /api/payoff/plans refuses an extra payment above the money left', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('POST', '/api/payoff/plans', {
      method: 'avalanche',
      extraPayment: 9_000_000,
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PAYOFF_EXTRA_TOO_HIGH');
  });

  test('POST /api/payoff/plans answers 400 when there is no consumer debt to plan', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "debt_accounts"') && query.sql.includes('"original_amount"')
        ? []
        : planned(query),
    );
    const res = await call('POST', '/api/payoff/plans', { method: 'snowball', extraPayment: 0 });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PAYOFF_NOTHING_TO_PLAN');
  });

  test('GET /api/payoff/plans/active answers the plan, or 404 before one is made', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('GET', '/api/payoff/plans/active');
    expect(res.status).toBe(200);
    expect((await res.json()).nextPayment).toMatchObject({ debtId: ID_A, amount: 210_000 });

    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "payoff_plans"') ? [] : planned(query),
    );
    const empty = await call('GET', '/api/payoff/plans/active');
    expect(empty.status).toBe(404);
    expect((await empty.json()).code).toBe('PAYOFF_PLAN_NOT_FOUND');
  });

  test('PATCH /api/payoff/plans/active moves the focus, and refuses an unknown account', async () => {
    dbControl.respond = signedIn(planned);
    const moved = await call('PATCH', '/api/payoff/plans/active', { focusDebtId: ID_B });
    expect(moved.status).toBe(200);
    expect((await moved.json()).accounts[0].name).toBe('Paylater B');

    const unknown = await call('PATCH', '/api/payoff/plans/active', {
      focusDebtId: '5b0a4c3e-9d7f-4a1e-8c2b-1f6e7d8c9b0a',
    });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).code).toBe('PAYOFF_DEBT_NOT_FOUND');
    expect((await call('PATCH', '/api/payoff/plans/active', { focusDebtId: 'x' })).status).toBe(
      422,
    );
  });

  test('POST /api/debts/{id}/payments records a part payment', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('POST', `/api/debts/${ID_A}/payments`, {
      amount: 210_000,
      paymentId: PAY,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      debtId: ID_A,
      remaining: 210_000,
      progressPercent: 65,
      paidOff: false,
      scoreEstimate: null,
    });
  });

  test('POST /api/debts/{id}/payments announces the paid-off account once', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('POST', `/api/debts/${ID_A}/payments`, {
      amount: 420_000,
      paymentId: PAY,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ paidOff: true, remaining: 0, nextAccount: { id: ID_B } });
    expect(body.scoreEstimate).toEqual({
      before: expect.any(Number),
      after: expect.any(Number),
      consumerDebtBefore: expect.any(Number),
      consumerDebtAfter: expect.any(Number),
    });
  });

  test('POST /api/debts/{id}/payments refuses what is not open, too high or malformed', async () => {
    dbControl.respond = signedIn(planned);
    const high = await call('POST', `/api/debts/${ID_A}/payments`, {
      amount: 420_001,
      paymentId: PAY,
    });
    expect(high.status).toBe(400);
    expect((await high.json()).code).toBe('PAYOFF_PAYMENT_TOO_HIGH');

    const stranger = '5b0a4c3e-9d7f-4a1e-8c2b-1f6e7d8c9b0a';
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "debt_accounts"') && query.params.includes(stranger)
        ? []
        : planned(query),
    );
    const missing = await call('POST', '/api/debts/5b0a4c3e-9d7f-4a1e-8c2b-1f6e7d8c9b0a/payments', {
      amount: 1_000,
      paymentId: PAY,
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe('PAYOFF_DEBT_NOT_FOUND');
    expect(
      (await call('POST', `/api/debts/${ID_A}/payments`, { amount: 0, paymentId: PAY })).status,
    ).toBe(422);
    expect(
      (await call('POST', '/api/debts/not-a-uuid/payments', { amount: 1, paymentId: PAY })).status,
    ).toBe(422);
  });

  test('POST /api/payoff/plans answers 422 to a malformed plan', async () => {
    dbControl.respond = signedIn(planned);
    const res = await call('POST', '/api/payoff/plans', { method: 'fastest', extraPayment: -1 });
    expect(res.status).toBe(422);
  });

  test('PATCH /api/payoff/plans/active: no plan, or another person’s account', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "payoff_plans"') ? [] : planned(query),
    );
    const none = await call('PATCH', '/api/payoff/plans/active', { focusDebtId: ID_B });
    expect(none.status).toBe(404);
    expect((await none.json()).code).toBe('PAYOFF_PLAN_NOT_FOUND');

    dbControl.respond = signedIn(planned);
    const strangers = '5b0a4c3e-9d7f-4a1e-8c2b-1f6e7d8c9b0a';
    const other = await call('PATCH', '/api/payoff/plans/active', { focusDebtId: strangers });
    expect(other.status).toBe(404);
    expect((await other.json()).code).toBe('PAYOFF_DEBT_NOT_FOUND');
  });
});
