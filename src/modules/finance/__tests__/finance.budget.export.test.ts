import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { budgetExportSections } from '../finance.budget.export.ts';
import type { BudgetRepository } from '../finance.repository.budget.ts';

const repositoryOf = (
  allocations: Awaited<ReturnType<BudgetRepository['findAllocations']>>,
): BudgetRepository => ({
  findAllocations: async () => allocations,
  findIncomeAndPayday: async () => ({ income: 0, payday: { day: null, endOfMonth: false } }),
  spendingByCategory: async () => [],
  monthlyInstalments: async () => 0,
  save: async () => undefined,
});

describe('budgetExportSections', () => {
  test('one block with each limit under its tile label', async () => {
    const limits = [{ category: EXPENSE_CATEGORY.food, amount: 1_800_000 }];
    expect(await budgetExportSections('owner-1', { repository: repositoryOf(limits) })).toEqual([
      {
        title: 'Uang · Budget',
        header: ['Kategori', 'Batas per Periode'],
        rows: [['Makan', '1800000']],
      },
    ]);
  });

  test('nothing before Atur Budget, or with no limits', async () => {
    expect(await budgetExportSections('owner-1', { repository: repositoryOf(null) })).toEqual([]);
    expect(await budgetExportSections('owner-1', { repository: repositoryOf([]) })).toEqual([]);
  });
});
