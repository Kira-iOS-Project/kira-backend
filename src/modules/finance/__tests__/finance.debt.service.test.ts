import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { getDebtDetail } from '../finance.debt.service.ts';
import type { DebtAccountRow, DebtDetailRepository } from '../finance.repository.debt.ts';

/** Paylater A on the DetailUtang board: Rp1.260.000 over 6, 4 paid, Rp420.000 left, due the 25th. */
const PAYLATER: DebtAccountRow = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Paylater A',
  kind: DEBT_KIND.paylater,
  originalAmount: 1_260_000,
  remainingAmount: 420_000,
  monthlyInstalment: 210_000,
  remainingTenorMonths: 2,
  dueDay: 25,
  paymentStatus: DEBT_PAYMENT_STATUS.onTime,
};

const PAYMENTS = ['2026-09-25', '2026-08-26', '2026-07-25', '2026-06-25'].map((day, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  amount: 210_000,
  paidAt: new Date(`${day}T03:00:00.000Z`),
}));

function repository(overrides: Partial<DebtDetailRepository> = {}): DebtDetailRepository {
  return { findDebt: async () => PAYLATER, listPayments: async () => PAYMENTS, ...overrides };
}

const deps = (overrides: Partial<Parameters<typeof getDebtDetail>[2]> = {}) => ({
  repository: repository(),
  now: () => new Date('2026-10-15T03:00:00.000Z'),
  priority: async () => ({ rank: 1, of: 3 }),
  estimate: async () => ({ before: 66, after: 71 }),
  ...overrides,
});

describe('getDebtDetail', () => {
  test('reads the DetailUtang board: 4 of 6 paid, due 25 October, clear it this month', async () => {
    const detail = await getDebtDetail('user-1', PAYLATER.id, deps());
    expect(detail).toMatchObject({
      remaining: 420_000,
      totalAmount: 1_260_000,
      paidAmount: 840_000,
      instalmentsPaid: 4,
      instalmentsTotal: 6,
      monthlyInstalment: 210_000,
      dueDate: '2026-10-25',
      nextStep: {
        priority: 1,
        priorityOf: 3,
        extraAmount: 210_000,
        payOn: '2026-10-25',
        monthsEarlier: 1,
        scoreBefore: 66,
        scoreAfter: 71,
      },
    });
    expect(detail.payments.map((payment) => [payment.number, payment.onTime])).toEqual([
      [4, true],
      [3, false],
      [2, true],
      [1, true],
    ]);
  });

  test('throws PAYOFF_DEBT_NOT_FOUND for an account that is not theirs', async () => {
    const missing = deps({ repository: repository({ findDebt: async () => null }) });
    expect(getDebtDetail('user-1', PAYLATER.id, missing)).rejects.toMatchObject({
      code: 'PAYOFF_DEBT_NOT_FOUND',
    });
  });

  test('leaves the counts out without a tenor, and the date without a due day', async () => {
    const open = { ...PAYLATER, remainingTenorMonths: null, dueDay: null };
    const detail = await getDebtDetail(
      'user-1',
      PAYLATER.id,
      deps({
        repository: repository({ findDebt: async () => open }),
      }),
    );
    expect(detail).toMatchObject({ instalmentsPaid: null, instalmentsTotal: null, dueDate: null });
    expect(detail.payments.every((payment) => payment.onTime)).toBe(true);
  });

  test('suggests nothing when the next instalment clears it, or outside the payoff order', async () => {
    const last = { ...PAYLATER, remainingAmount: 210_000 };
    const cleared = await getDebtDetail(
      'user-1',
      PAYLATER.id,
      deps({
        repository: repository({ findDebt: async () => last }),
      }),
    );
    expect(cleared.nextStep).toBeNull();
    const outside = await getDebtDetail(
      'user-1',
      PAYLATER.id,
      deps({ priority: async () => null }),
    );
    expect(outside.nextStep).toBeNull();
  });

  test('has no score estimate before the health check, and no months saved at a zero instalment', async () => {
    const free = { ...PAYLATER, monthlyInstalment: 0 };
    const detail = await getDebtDetail(
      'user-1',
      PAYLATER.id,
      deps({
        repository: repository({ findDebt: async () => free }),
        estimate: async () => null,
      }),
    );
    expect(detail.nextStep).toMatchObject({
      scoreBefore: null,
      scoreAfter: null,
      monthsEarlier: 0,
    });
  });
});
