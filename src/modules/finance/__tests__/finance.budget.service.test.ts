import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { INDICATOR } from '../../../lib/constants/score.ts';
import { getCurrentBudget } from '../finance.budget.service.ts';
import type { BudgetRepository } from '../finance.repository.budget.ts';

function repository(overrides: Partial<BudgetRepository> = {}): BudgetRepository {
  return {
    getBudget: async () => null,
    getProfileBudget: async () => ({ income: 100_000, payday: { type: 'day', day: 5 } }),
    getBudgetGoalProfile: async () => null,
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
});
