import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import type { DebtInput } from '../../score/index.ts';
import { recordPayment, type PaymentDeps } from '../payoff.payment.service.ts';
import type { Payment } from '../payoff.plan.repository.ts';
import { createPlanRepositoryMock, ID_A, ID_B, ID_MOTOR, NOW, PLAN_DEBTS } from './helpers.ts';

const [A, B, MOTOR] = [ID_A, ID_B, ID_MOTOR];
const ESTIMATE = { before: 60, after: 66, consumerDebtBefore: 50, consumerDebtAfter: 80 };

function setup(overrides: Partial<PaymentDeps> = {}) {
  const applied: unknown[] = [];
  const estimated: DebtInput[] = [];
  const deps: PaymentDeps = {
    repository: createPlanRepositoryMock({
      recordPayment: async (userId: string, debtId: string, payment: Payment, at: Date) => {
        applied.push([userId, debtId, payment, at]);
        return true;
      },
    }),
    now: () => NOW,
    estimateScore: async (_userId, paid) => {
      estimated.push(paid);
      return ESTIMATE;
    },
    ...overrides,
  };
  return { deps, applied, estimated };
}

describe('recordPayment', () => {
  test('lowers the balance and updates the progress', async () => {
    const { deps, applied, estimated } = setup();
    const result = await recordPayment('user-1', A, 210_000, deps);

    expect(result).toEqual({
      debtId: A,
      paid: 210_000,
      remaining: 210_000,
      progressPercent: 65,
      paidOff: false,
      nextAccount: null,
      scoreEstimate: null,
    });
    expect(applied).toEqual([['user-1', A, { amount: 210_000, from: 420_000, to: 210_000 }, NOW]]);
    expect(estimated).toEqual([]);
  });

  test('the payment that settles the account is the paid-off event', async () => {
    const { deps, estimated } = setup();
    const result = await recordPayment('user-1', A, 420_000, deps);

    expect(result).toMatchObject({
      remaining: 0,
      progressPercent: 100,
      paidOff: true,
      nextAccount: { id: B, name: 'Paylater B' },
      scoreEstimate: ESTIMATE,
    });
    expect(estimated).toEqual([
      {
        kind: DEBT_KIND.paylater,
        name: 'Paylater A',
        remaining: 420_000,
        monthlyInstalment: 210_000,
        paymentStatus: DEBT_PAYMENT_STATUS.onTime,
      },
    ]);
  });

  test('has no next account when the plan has no other consumer account, or no plan', async () => {
    const alone = setup({
      repository: createPlanRepositoryMock({ listDebts: async () => PLAN_DEBTS.slice(0, 1) }),
    });
    expect((await recordPayment('user-1', A, 420_000, alone.deps)).nextAccount).toBeNull();

    const none = setup({ repository: createPlanRepositoryMock({ findActive: async () => null }) });
    expect((await recordPayment('user-1', A, 420_000, none.deps)).nextAccount).toBeNull();
  });

  test('a productive debt paid off carries no score estimate', async () => {
    const { deps, estimated } = setup();
    const result = await recordPayment('user-1', MOTOR, 13_000_000, deps);

    expect(result).toMatchObject({ paidOff: true, scoreEstimate: null });
    expect(estimated).toEqual([]);
  });

  test('answers PAYOFF_DEBT_NOT_FOUND for an account that is not open', async () => {
    const { deps, applied } = setup();
    await expect(recordPayment('user-1', 'missing', 1_000, deps)).rejects.toMatchObject({
      code: 'PAYOFF_DEBT_NOT_FOUND',
    });
    expect(applied).toEqual([]);
  });

  test('refuses a payment above what is left, and one that lost a race', async () => {
    const { deps, applied } = setup();
    await expect(recordPayment('user-1', A, 420_001, deps)).rejects.toMatchObject({
      code: 'PAYOFF_PAYMENT_TOO_HIGH',
    });
    expect(applied).toEqual([]);

    const raced = setup({
      repository: createPlanRepositoryMock({ recordPayment: async () => false }),
    });
    await expect(recordPayment('user-1', A, 1_000, raced.deps)).rejects.toMatchObject({
      code: 'PAYOFF_PAYMENT_TOO_HIGH',
    });
  });
});
