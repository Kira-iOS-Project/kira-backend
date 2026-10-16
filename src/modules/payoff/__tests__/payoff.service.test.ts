import { describe, expect, test } from 'bun:test';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { PAYOFF_METHOD } from '../../../lib/constants/payoff.ts';
import { simulatePayoff, type PayoffDeps } from '../payoff.service.ts';
import { createPayoffRepositoryMock, DINDA_OPEN, NOW, payoffDebt } from './helpers.ts';

const deps = (overrides: Partial<PayoffDeps> = {}): PayoffDeps => ({
  repository: createPayoffRepositoryMock(),
  now: () => NOW,
  remainingMoney: async () => 1_840_000,
  ...overrides,
});

const snowball = { method: PAYOFF_METHOD.snowball, extraPayment: 0 };

describe('simulatePayoff', () => {
  test('plans the consumer debts and leaves the motorbike out', async () => {
    const plan = await simulatePayoff('user-1', snowball, deps());

    expect(plan.accounts.map((a) => [a.position, a.name])).toEqual([
      [1, 'Paylater A'],
      [2, 'Paylater B'],
    ]);
    expect(plan.productive).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000003',
        kind: DEBT_KIND.vehicle,
        name: 'Cicilan Motor',
        remaining: 13_000_000,
        monthlyInstalment: 850_000,
      },
    ]);
    expect(plan.monthlyBudget).toBe(500_000);
    expect(plan.maxExtraPayment).toBe(1_840_000);
    expect(plan.hasUnknownRate).toBe(false);
  });

  test('names the payoff month from today in WIB, this month counted as 1', async () => {
    const plan = await simulatePayoff('user-1', snowball, deps());
    const [first] = plan.accounts;

    expect(first?.months).toBe(3);
    expect(first?.payoffMonth).toBe('2026-12');
    expect(plan.allPaidMonth).toBe(plan.accounts.at(-1)?.payoffMonth ?? null);
    expect(plan.allPaidMonths).toBe(plan.accounts.at(-1)?.months ?? null);
  });

  test('adds the extra payment to the budget and shortens the plan', async () => {
    const slow = await simulatePayoff('user-1', snowball, deps());
    const fast = await simulatePayoff('user-1', { ...snowball, extraPayment: 500_000 }, deps());

    expect(fast.monthlyBudget).toBe(1_000_000);
    expect(fast.allPaidMonths ?? 99).toBeLessThan(slow.allPaidMonths ?? 0);
  });

  test('accepts an extra payment equal to the money left, refuses one above', async () => {
    const exact = { ...snowball, extraPayment: 1_840_000 };
    expect((await simulatePayoff('user-1', exact, deps())).extraPayment).toBe(1_840_000);
    await expect(
      simulatePayoff('user-1', { ...snowball, extraPayment: 1_840_001 }, deps()),
    ).rejects.toMatchObject({ code: 'PAYOFF_EXTRA_TOO_HIGH' });
  });

  test('compares with the other method', async () => {
    const plan = await simulatePayoff('user-1', snowball, deps());
    const avalanche = await simulatePayoff(
      'user-1',
      { ...snowball, method: PAYOFF_METHOD.avalanche },
      deps(),
    );

    expect(plan.comparison?.otherMethod).toBe(PAYOFF_METHOD.avalanche);
    expect(avalanche.comparison?.otherMethod).toBe(PAYOFF_METHOD.snowball);
    /** What one method saves, the other loses. */
    expect((plan.comparison?.interestSaved ?? 1) + (avalanche.comparison?.interestSaved ?? 1)).toBe(
      0,
    );
    expect(avalanche.accounts[0]?.name).toBe('Paylater B');
    expect(plan.comparison?.firstPayoffMonthsLater).toBe(
      (avalanche.accounts[0]?.months ?? 0) - (plan.accounts[0]?.months ?? 0),
    );
  });

  test('saves interest with avalanche once an extra payment goes to the dearest account', async () => {
    const snow = await simulatePayoff('user-1', { ...snowball, extraPayment: 200_000 }, deps());
    const ava = await simulatePayoff(
      'user-1',
      { method: PAYOFF_METHOD.avalanche, extraPayment: 200_000 },
      deps(),
    );

    expect(ava.comparison?.interestSaved ?? 0).toBeGreaterThan(0);
    expect(snow.comparison?.interestSaved).toBe(-(ava.comparison?.interestSaved ?? 0));
    expect(ava.totalInterest ?? Infinity).toBeLessThan(snow.totalInterest ?? 0);
  });

  test('says nothing about interest saved when no rate is known', async () => {
    const unknown = [payoffDebt({ id: 'a' }), payoffDebt({ id: 'b', remaining: 890_000 })];
    const plan = await simulatePayoff(
      'user-1',
      snowball,
      deps({ repository: createPayoffRepositoryMock({ listOpenDebts: async () => unknown }) }),
    );

    expect(plan.hasUnknownRate).toBe(true);
    expect(plan.comparison?.interestSaved).toBeNull();
    expect(plan.comparison?.firstPayoffMonthsLater).not.toBeNull();
  });

  test('counts a rate-less account as 0% but still flags it', async () => {
    const mixed = [DINDA_OPEN[0], payoffDebt({ id: 'x', name: 'Paylater C' })].filter(
      (d) => d !== undefined,
    );
    const plan = await simulatePayoff(
      'user-1',
      snowball,
      deps({ repository: createPayoffRepositoryMock({ listOpenDebts: async () => mixed }) }),
    );

    expect(plan.hasUnknownRate).toBe(true);
    expect(plan.comparison?.interestSaved).not.toBeNull();
  });

  test('answers an empty plan when there is no consumer debt', async () => {
    const onlyMotor = DINDA_OPEN.slice(2);
    const plan = await simulatePayoff(
      'user-1',
      snowball,
      deps({ repository: createPayoffRepositoryMock({ listOpenDebts: async () => onlyMotor }) }),
    );

    expect(plan).toMatchObject({
      accounts: [],
      monthlyBudget: 0,
      totalInterest: null,
      allPaidMonths: null,
      allPaidMonth: null,
      comparison: null,
      hasUnknownRate: false,
    });
    expect(plan.productive).toHaveLength(1);
  });

  test('leaves the month empty for an account that is never paid off', async () => {
    const stuck = [
      payoffDebt({ remaining: 10_000_000, monthlyInstalment: 50_000, annualInterestRate: 60 }),
    ];
    const plan = await simulatePayoff(
      'user-1',
      snowball,
      deps({ repository: createPayoffRepositoryMock({ listOpenDebts: async () => stuck }) }),
    );

    expect(plan.accounts[0]).toMatchObject({ months: null, payoffMonth: null, interest: null });
    expect(plan.allPaidMonth).toBeNull();
    expect(plan.comparison?.firstPayoffMonthsLater).toBeNull();
  });
});
