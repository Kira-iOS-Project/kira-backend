/**
 * What Rencanaku shows beyond the order: the next payment, its due date and the days left, and how
 * the stored focus and a missing balance read. Run through the service, the view's only caller.
 */

import { describe, expect, test } from 'bun:test';
import { getActivePlan, type PlanDeps } from '../payoff.plan.service.ts';
import { createPlanRepositoryMock, ID_A, ID_B, NOW, PAYOFF_PLAN, PLAN_DEBTS } from './helpers.ts';

const deps = (overrides: Partial<PlanDeps> = {}): PlanDeps => ({
  repository: createPlanRepositoryMock(),
  now: () => NOW,
  remainingMoney: async () => 1_840_000,
  ...overrides,
});

const [A, B] = [ID_A, ID_B];

describe('planView', () => {
  test('names the next payment with its due date and the days left', async () => {
    const { nextPayment } = await getActivePlan('user-1', deps());
    /** Paylater A is due on the 5th: today is 16 October, so 5 November, 20 days away. */
    expect(nextPayment).toEqual({
      debtId: A,
      name: 'Paylater A',
      amount: 210_000,
      dueDate: '2026-11-05',
      daysLeft: 20,
    });
  });

  test('a due day later this month is this month, today included', async () => {
    const due = (day: number) =>
      getActivePlan(
        'user-1',
        deps({
          repository: createPlanRepositoryMock({
            listDebts: async () =>
              PLAN_DEBTS.map((debt) => Object.assign({}, debt, { dueDay: day })),
          }),
        }),
      );

    expect((await due(16)).nextPayment).toMatchObject({ dueDate: '2026-10-16', daysLeft: 0 });
    expect((await due(31)).nextPayment).toMatchObject({ dueDate: '2026-10-31', daysLeft: 15 });
  });

  test('pulls a due day back to the last day of a short month', async () => {
    const plan = await getActivePlan(
      'user-1',
      deps({
        now: () => new Date('2027-01-20T05:00:00.000Z'),
        repository: createPlanRepositoryMock({
          listDebts: async () => PLAN_DEBTS.map((debt) => Object.assign({}, debt, { dueDay: 31 })),
        }),
      }),
    );
    expect(plan.nextPayment?.dueDate).toBe('2027-01-31');

    const february = await getActivePlan(
      'user-1',
      deps({
        now: () => new Date('2027-01-31T17:00:00.000Z'),
        repository: createPlanRepositoryMock({
          listDebts: async () => PLAN_DEBTS.map((debt) => Object.assign({}, debt, { dueDay: 30 })),
        }),
      }),
    );
    expect(february.nextPayment?.dueDate).toBe('2027-02-28');
  });

  test('has no due date for an account without a due day, and caps the amount at what is left', async () => {
    const plan = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({
          listDebts: async () => [
            Object.assign({}, PLAN_DEBTS[0], { dueDay: null, remaining: 100_000 }),
          ],
        }),
      }),
    );
    expect(plan.nextPayment).toMatchObject({ amount: 100_000, dueDate: null, daysLeft: null });
  });

  test('counts a zero original balance as no progress', async () => {
    const plan = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({
          listDebts: async () => [Object.assign({}, PLAN_DEBTS[0], { original: 0 })],
        }),
      }),
    );
    expect(plan.accounts[0]?.progressPercent).toBe(0);
  });

  test('follows the stored focus, or the order when that account is gone', async () => {
    const focused = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({
          findActive: async () => ({ ...PAYOFF_PLAN, focusDebtId: B }),
        }),
      }),
    );
    expect(focused.accounts.map((a) => a.name)).toEqual([
      'Paylater B',
      'Paylater A',
      'Cicilan Motor',
    ]);
    expect(focused.nextPayment?.debtId).toBe(B);

    const gone = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({
          findActive: async () => ({ ...PAYOFF_PLAN, focusDebtId: 'deleted' }),
        }),
      }),
    );
    expect(gone.accounts[0]?.name).toBe('Paylater A');
  });

  test('shows no next payment when every consumer account is paid', async () => {
    const plan = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({ listDebts: async () => PLAN_DEBTS.slice(2) }),
      }),
    );
    expect(plan.nextPayment).toBeNull();
    expect(plan.accounts).toHaveLength(1);
  });
});
