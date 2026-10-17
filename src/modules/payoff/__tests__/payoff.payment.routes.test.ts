/**
 * Tandai Sudah Bayar through the real app: a repeated payment id, a payment that lost the race for
 * the balance, an account paid off meanwhile, and how Rencanaku then shows it.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';
import { ID_A } from './helpers.ts';
import { call, PLAN_DEBT_ROWS, planned } from './routes-fixtures.ts';

beforeEach(() => resetExternalMocks());

const PAY = '00000000-0000-4000-8000-0000000000f1';

describe('Tandai Sudah Bayar', () => {
  test('POST /api/debts/{id}/payments answers 409 to a repeated payment id', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('insert into "debt_payments"') ? [] : planned(query),
    );
    const res = await call('POST', `/api/debts/${ID_A}/payments`, {
      amount: 1_000,
      paymentId: PAY,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PAYOFF_PAYMENT_ALREADY_RECORDED');
  });

  test('POST /api/debts/{id}/payments refuses a payment that lost a race for the balance', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('update "debt_accounts"') ? [] : planned(query),
    );
    const res = await call('POST', `/api/debts/${ID_A}/payments`, {
      amount: 1_000,
      paymentId: PAY,
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PAYOFF_PAYMENT_TOO_HIGH');
  });

  test('POST /api/debts/{id}/payments: a paid account is not open, unless it is the repeat', async () => {
    const closed = (paid: boolean) =>
      signedIn((query) => {
        if (query.sql.includes('from "debt_payments"')) return paid ? [{ id: 'payment-1' }] : [];
        return query.sql.includes('from "debt_accounts"') && query.params.includes(ID_A)
          ? []
          : planned(query);
      });
    dbControl.respond = closed(false);
    const other = await call('POST', `/api/debts/${ID_A}/payments`, { amount: 1, paymentId: PAY });
    expect((await other.json()).code).toBe('PAYOFF_DEBT_NOT_FOUND');

    dbControl.respond = closed(true);
    const repeat = await call('POST', `/api/debts/${ID_A}/payments`, { amount: 1, paymentId: PAY });
    expect((await repeat.json()).code).toBe('PAYOFF_PAYMENT_ALREADY_RECORDED');
  });

  test('Rencanaku keeps a paid account first and dates every account', async () => {
    const paid = { ...PLAN_DEBT_ROWS[0], remaining: 0, paidOffAt: '2026-10-16T03:00:00.000Z' };
    dbControl.respond = signedIn((query) => {
      if (query.sql.includes('"paid_off_at" >=')) return [paid];
      if (query.sql.includes('"original_amount"')) return PLAN_DEBT_ROWS.slice(1);
      return planned(query);
    });
    const body = await (await call('GET', '/api/payoff/plans/active')).json();
    const pick = ({ name, status, payoffDate, startMonth }: Record<string, unknown>) => ({
      name,
      status,
      payoffDate,
      startMonth,
    });

    expect(body.accounts.map(pick)).toEqual([
      { name: 'Paylater A', status: 'paid_off', payoffDate: '2026-10-16', startMonth: null },
      { name: 'Paylater B', status: 'in_progress', payoffDate: null, startMonth: null },
      {
        name: 'Cicilan Motor',
        status: 'ongoing',
        payoffDate: expect.any(String),
        startMonth: null,
      },
    ]);
    expect(body.accounts[1].payoffMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
