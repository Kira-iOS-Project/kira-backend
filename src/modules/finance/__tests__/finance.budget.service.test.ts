/**
 * Budget per Kategori from the board's numbers: Rp7.500.000,00 of income, payday the 25th, the
 * period 25 September – 24 Oktober 2026 (Beranda's), Belanja at 90% and the Dana Darurat pos.
 */

import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { getCurrentBudget, saveCurrentBudget } from '../finance.budget.service.ts';
import type { BudgetRepository } from '../finance.repository.budget.ts';

const { food, shopping, bills } = EXPENSE_CATEGORY;
const NOW = () => new Date('2026-10-14T05:00:00.000Z');
const GOAL = {
  id: 'goal-1',
  saved: 4_800_000,
  target: 25_200_000,
  monthlyDeposit: 650_000,
  essential: 4_200_000,
};

function repositoryOf(overrides: Partial<BudgetRepository> = {}) {
  const ranges: string[] = [];
  const repository: BudgetRepository = {
    findAllocations: async () => [
      { category: food, amount: 1_800_000 },
      { category: shopping, amount: 600_000 },
    ],
    findIncomeAndPayday: async () => ({
      income: 7_500_000,
      payday: { day: 25, endOfMonth: false },
    }),
    spendingByCategory: async (_userId, from, to) => {
      ranges.push(`${from.toISOString()}→${to.toISOString()}`);
      return ranges.length === 1
        ? [
            { category: food, amount: 1_380_000 },
            { category: shopping, amount: 540_000 },
          ]
        : [{ category: bills, amount: 2_550_000 }];
    },
    monthlyInstalments: async () => 1_350_000,
    save: async () => undefined,
    ...overrides,
  };
  return { repository, ranges };
}

describe('getCurrentBudget', () => {
  test("the board's budget: Beranda's period, limits, 90% tag, averages, instalments, goal pos", async () => {
    const { repository, ranges } = repositoryOf();
    const budget = await getCurrentBudget('owner-1', {
      repository,
      emergencyGoal: async () => GOAL,
      now: NOW,
    });

    expect(budget).toEqual({
      configured: true,
      income: 7_500_000,
      remaining: 5_580_000,
      allocations: [
        { category: food, amount: 1_800_000, spent: 1_380_000, nearLimit: false },
        { category: shopping, amount: 600_000, spent: 540_000, nearLimit: true },
      ],
      totalAllocated: 2_400_000,
      overAllocated: false,
      averages: [{ category: bills, amount: 850_000 }],
      instalmentsMonthly: 1_350_000,
      goalPost: {
        goalId: 'goal-1',
        monthlyDeposit: 650_000,
        savedAmount: 4_800_000,
        targetAmount: 25_200_000,
      },
      payday: {
        requested: { day: 25, endOfMonth: false },
        periodStart: '2026-09-25',
        periodEnd: '2026-10-24',
        nextPayday: '2026-10-25',
        daysUntilPayday: 11,
      },
    });
    /** This period up to today, then the three periods before it: 25 June – 24 September. */
    expect(ranges).toEqual([
      '2026-09-24T17:00:00.000Z→2026-10-14T17:00:00.000Z',
      '2026-06-24T17:00:00.000Z→2026-09-24T17:00:00.000Z',
    ]);
  });

  test('before Atur Budget and without a goal: no limits, no pos, over-allocated never', async () => {
    const { repository } = repositoryOf({
      findAllocations: async () => null,
      findIncomeAndPayday: async () => ({ income: 0, payday: { day: null, endOfMonth: false } }),
    });
    const budget = await getCurrentBudget('owner-1', {
      repository,
      emergencyGoal: async () => null,
      now: NOW,
    });

    expect(budget).toMatchObject({
      configured: false,
      allocations: [],
      goalPost: null,
      overAllocated: false,
    });
    /** No payday yet: the calendar month, as Beranda counts it. */
    expect(budget.payday).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  });

  test('more allotted than the income is shown, not refused', async () => {
    const { repository } = repositoryOf({
      findAllocations: async () => [{ category: food, amount: 8_000_000 }],
    });
    const budget = await getCurrentBudget('owner-1', {
      repository,
      emergencyGoal: async () => null,
      now: NOW,
    });
    expect(budget.overAllocated).toBe(true);
  });

  test('reads the clock and the Rencana goal itself when not given them', async () => {
    const { repository } = repositoryOf();
    expect((await getCurrentBudget('owner-1', { repository })).goalPost).toBeNull();
  });
});

describe('saveCurrentBudget', () => {
  test('stores the limits and the payday, then answers the budget', async () => {
    const saved: unknown[] = [];
    const { repository } = repositoryOf({
      save: async (...args) => {
        saved.push(args);
      },
    });
    const body = {
      allocations: [{ category: food, amount: 1_800_000 }],
      payday: { day: 25, endOfMonth: false },
    };
    const budget = await saveCurrentBudget('owner-1', body, {
      repository,
      emergencyGoal: async () => null,
      now: NOW,
    });

    expect(saved).toEqual([['owner-1', body.allocations, body.payday]]);
    expect(budget.configured).toBe(true);
  });
});
