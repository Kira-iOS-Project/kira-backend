import { describe, expect, test } from 'bun:test';
import { PAYOFF_ACCOUNT_STATUS, PAYOFF_METHOD } from '../../../lib/constants/payoff.ts';
import type { PlanDeps } from '../payoff.plan.service.ts';
import {
  createPlan,
  getActivePlan,
  payingNowOf,
  priorityOf,
  setPlanFocus,
} from '../payoff.plan.service.ts';
import {
  createPlanRepositoryMock,
  ID_A,
  ID_B,
  ID_MOTOR,
  NOW,
  PAYOFF_PLAN,
  PLAN_DEBTS,
} from './helpers.ts';

const [A, B, MOTOR] = [ID_A, ID_B, ID_MOTOR];

const deps = (overrides: Partial<PlanDeps> = {}): PlanDeps => ({
  repository: createPlanRepositoryMock(),
  now: () => NOW,
  remainingMoney: async () => 1_840_000,
  ...overrides,
});

describe('getActivePlan', () => {
  test('lists the accounts in plan order with progress and tags', async () => {
    const plan = await getActivePlan('user-1', deps());

    expect(plan.accounts.map((a) => [a.name, a.status, a.progressPercent])).toEqual([
      ['Paylater A', PAYOFF_ACCOUNT_STATUS.inProgress, 30],
      ['Paylater B', PAYOFF_ACCOUNT_STATUS.next, 11],
      ['Cicilan Motor', PAYOFF_ACCOUNT_STATUS.ongoing, 13],
    ]);
    expect(plan).toMatchObject({ method: 'snowball', startedAt: '2026-10-10T03:00:00.000Z' });
  });

  test('tags a third consumer account Jalan terus', async () => {
    const third = Object.assign({}, PLAN_DEBTS[1], {
      id: 'c',
      name: 'Pinjol C',
      remaining: 2_000_000,
    });
    const plan = await getActivePlan(
      'user-1',
      deps({
        repository: createPlanRepositoryMock({
          listDebts: async () => [...PLAN_DEBTS, third],
        }),
      }),
    );

    expect(plan.accounts.map((a) => a.status)).toEqual([
      PAYOFF_ACCOUNT_STATUS.inProgress,
      PAYOFF_ACCOUNT_STATUS.next,
      PAYOFF_ACCOUNT_STATUS.ongoing,
      PAYOFF_ACCOUNT_STATUS.ongoing,
    ]);
  });

  test('answers PAYOFF_PLAN_NOT_FOUND before a plan is made', async () => {
    await expect(
      getActivePlan(
        'user-1',
        deps({ repository: createPlanRepositoryMock({ findActive: async () => null }) }),
      ),
    ).rejects.toMatchObject({ code: 'PAYOFF_PLAN_NOT_FOUND' });
  });
});

describe('createPlan', () => {
  test('starts on the first account of the method and returns the plan', async () => {
    const created: unknown[] = [];
    const plan = await createPlan(
      'user-1',
      { method: PAYOFF_METHOD.avalanche, extraPayment: 200_000 },
      deps({
        repository: createPlanRepositoryMock({
          createPlan: async (_userId, input, at) => {
            created.push([input, at]);
            return { ...PAYOFF_PLAN, ...input };
          },
        }),
      }),
    );

    expect(created).toEqual([
      [{ method: 'avalanche', extraPayment: 200_000, focusDebtId: B }, NOW],
    ]);
    expect(plan.accounts[0]?.name).toBe('Paylater B');
    expect(plan.extraPayment).toBe(200_000);
  });

  test('refuses an extra payment above the money left', async () => {
    await expect(
      createPlan('user-1', { method: 'snowball', extraPayment: 1_840_001 }, deps()),
    ).rejects.toMatchObject({ code: 'PAYOFF_EXTRA_TOO_HIGH' });
  });

  test('refuses a plan without consumer debt', async () => {
    await expect(
      createPlan(
        'user-1',
        { method: 'snowball', extraPayment: 0 },
        deps({
          repository: createPlanRepositoryMock({ listDebts: async () => PLAN_DEBTS.slice(2) }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'PAYOFF_NOTHING_TO_PLAN' });
  });
});

describe('setPlanFocus', () => {
  test('moves the focus to another open consumer account', async () => {
    const moves: unknown[] = [];
    const plan = await setPlanFocus(
      'user-1',
      B,
      deps({
        repository: createPlanRepositoryMock({
          setFocus: async (planId, debtId) => void moves.push([planId, debtId]),
        }),
      }),
    );

    expect(moves).toEqual([[PAYOFF_PLAN.id, B]]);
    expect(plan.accounts[0]?.name).toBe('Paylater B');
  });

  test('refuses an account that is not an open consumer account of the person', async () => {
    for (const id of [MOTOR, 'someone-elses']) {
      await expect(setPlanFocus('user-1', id, deps())).rejects.toMatchObject({
        code: 'PAYOFF_DEBT_NOT_FOUND',
      });
    }
  });

  test('answers PAYOFF_PLAN_NOT_FOUND without a plan', async () => {
    await expect(
      setPlanFocus(
        'user-1',
        A,
        deps({ repository: createPlanRepositoryMock({ findActive: async () => null }) }),
      ),
    ).rejects.toMatchObject({ code: 'PAYOFF_PLAN_NOT_FOUND' });
  });
});

describe('payingNowOf', () => {
  test("the plan's account being paid off, or the smallest consumer debt without a plan", async () => {
    const focused = createPlanRepositoryMock({
      findActive: async () => ({ ...PAYOFF_PLAN, focusDebtId: B }),
    });
    expect(await payingNowOf('user-1', { repository: focused })).toEqual({
      id: B,
      name: 'Paylater B',
    });

    const none = createPlanRepositoryMock({ findActive: async () => null });
    expect(await payingNowOf('user-1', { repository: none })).toEqual({
      id: A,
      name: 'Paylater A',
    });

    const clear = createPlanRepositoryMock({ listDebts: async () => [] });
    expect(await payingNowOf('user-1', { repository: clear })).toBeNull();
  });
});

describe('priorityOf', () => {
  test("an account's place in the plan's order, smallest first without a plan, none outside it", async () => {
    const focused = createPlanRepositoryMock({
      findActive: async () => ({ ...PAYOFF_PLAN, focusDebtId: B }),
    });
    expect(await priorityOf('user-1', B, { repository: focused })).toEqual({ rank: 1, of: 2 });
    const none = createPlanRepositoryMock({ findActive: async () => null });
    expect(await priorityOf('user-1', A, { repository: none })).toEqual({ rank: 1, of: 2 });
    expect(await priorityOf('user-1', MOTOR, { repository: none })).toBeNull();
  });
});
