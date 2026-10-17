import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { INDICATOR } from '../../../lib/constants/score.ts';
import {
  getCurrentBudget,
  getCurrentBudgetEdit,
  updateCurrentBudget,
} from '../finance.budget.service.ts';
import type { BudgetRepository } from '../finance.repository.budget.ts';

function repository(overrides: Partial<BudgetRepository> = {}): BudgetRepository {
  return {
    getBudget: async () => null,
    getProfileBudget: async () => ({ income: 100_000, payday: { type: 'day', day: 5 } }),
    getBudgetGoalProfile: async () => null,
    saveBudget: async () => undefined,
    spendingByCategory: async () => [],
    ...overrides,
  };
}

describe('current budget', () => {
  test('uses the profile, shifts payday before weekends and Indonesian holidays, and scopes reads to the owner', async () => {
    const calls: string[] = [];
    const result = await getCurrentBudget('owner-1', {
      now: () => new Date('2027-01-02T18:00:00.000Z'),
      repository: repository({
        getProfileBudget: async (userId) => {
          calls.push(userId);
          return { income: 100_000, payday: { type: 'day', day: 5 } };
        },
        spendingByCategory: async (userId, from, to) => {
          calls.push(`${userId}:${from.toISOString()}:${to.toISOString()}`);
          return [{ category: EXPENSE_CATEGORY.bills, amount: 40_000 }];
        },
      }),
    });

    expect(calls.every((call) => call.startsWith('owner-1'))).toBe(true);
    expect(result).toMatchObject({
      configured: false,
      income: 100_000,
      remaining: 60_000,
      payday: {
        requested: { type: 'day', day: 5 },
        adjustedDate: '2026-12-04',
        periodStart: '2026-12-04',
        periodEnd: '2027-01-03',
        nextPayday: '2027-01-04',
        daysUntilPayday: 1,
      },
    });
  });

  test('includes allocation spend, near-limit state, goal posts, and an over-allocation warning', async () => {
    const result = await getCurrentBudget('owner-1', {
      now: () => new Date('2026-10-16T17:00:00.000Z'),
      repository: repository({
        getBudget: async () => ({
          income: 100_000,
          allocations: [{ category: EXPENSE_CATEGORY.bills, amount: 120_000 }],
          payday: { type: 'endOfMonth' },
        }),
        getBudgetGoalProfile: async () => ({
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          essentialMonthlyExpenses: 100_000,
          emergencyFund: 100_000,
          maritalStatus: null,
          dependents: 0,
        }),
        spendingByCategory: async () => [{ category: EXPENSE_CATEGORY.bills, amount: 110_000 }],
      }),
    });

    expect(result).toMatchObject({
      configured: true,
      totalAllocated: 120_000,
      overAllocated: true,
      allocations: [
        {
          category: EXPENSE_CATEGORY.bills,
          amount: 120_000,
          spent: 110_000,
          nearLimit: true,
        },
      ],
      goalPosts: [
        {
          category: INDICATOR.emergencyFund,
          targetAmount: 600_000,
          milestones: [
            { amount: 100_000, label: '1×', reached: true },
            { amount: 300_000, label: '3×', reached: false },
            { amount: 600_000, label: '6×', reached: false },
          ],
        },
      ],
    });
  });

  test('averages spending across the last three complete adjusted-payday periods', async () => {
    let calls = 0;
    const result = await getCurrentBudgetEdit('owner-1', {
      now: () => new Date('2026-10-17T05:00:00.000Z'),
      repository: repository({
        getBudget: async () => ({
          income: 100_000,
          allocations: [],
          payday: { type: 'day', day: 31 },
        }),
        getBudgetGoalProfile: async () => ({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          essentialMonthlyExpenses: null,
          emergencyFund: null,
          maritalStatus: null,
          dependents: 0,
        }),
        spendingByCategory: async () => {
          calls += 1;
          if (calls === 1) return [];
          if (calls === 2)
            return [
              { category: EXPENSE_CATEGORY.bills, amount: 300 },
              { category: EXPENSE_CATEGORY.transport, amount: 150 },
            ];
          if (calls === 3) return [{ category: EXPENSE_CATEGORY.bills, amount: 150 }];
          return [
            { category: EXPENSE_CATEGORY.bills, amount: 150 },
            { category: EXPENSE_CATEGORY.transport, amount: 450 },
          ];
        },
      }),
    });

    expect(result).toMatchObject({
      averagePeriods: 3,
      averages: [
        { category: EXPENSE_CATEGORY.bills, amount: 200 },
        { category: EXPENSE_CATEGORY.transport, amount: 200 },
      ],
    });
    expect(calls).toBe(4);
  });

  test('returns no average when the account has no complete period yet', async () => {
    const result = await getCurrentBudgetEdit('owner-1', {
      now: () => new Date('2026-10-17T05:00:00.000Z'),
      repository: repository({
        getBudget: async () => ({
          income: 100_000,
          allocations: [],
          payday: { type: 'day', day: 31 },
        }),
        getBudgetGoalProfile: async () => ({
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          essentialMonthlyExpenses: null,
          emergencyFund: null,
          maritalStatus: null,
          dependents: 0,
        }),
      }),
    });

    expect(result).toMatchObject({ averagePeriods: 0, averages: [] });
  });

  test('saves income, allocations and payday before returning the current budget', async () => {
    const input = {
      income: 100_000,
      allocations: [{ category: EXPENSE_CATEGORY.bills, amount: 120_000 }],
      payday: { type: 'endOfMonth' as const },
    };
    let saved: unknown;
    const result = await updateCurrentBudget('owner-1', input, {
      now: () => new Date('2026-10-17T05:00:00.000Z'),
      repository: repository({
        getBudget: async () => input,
        saveBudget: async (_userId, body) => {
          saved = body;
        },
      }),
    });

    expect(saved).toEqual(input);
    expect(result).toMatchObject({
      configured: true,
      totalAllocated: 120_000,
      overAllocated: true,
      payday: { requested: { type: 'endOfMonth' } },
    });
  });
});
