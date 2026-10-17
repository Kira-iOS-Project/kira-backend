/**
 * Atur Budget's part of the data export: one block with each category's limit, worded like the
 * transactions (the tile labels people read). The payday is in the account block already.
 */

import { EXPENSE_CATEGORY } from '../../lib/constants/money.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';

/** CatatManual's tiles, as the transactions block words them. */
const CATEGORY_LABEL: Record<(typeof EXPENSE_CATEGORY)[keyof typeof EXPENSE_CATEGORY], string> = {
  [EXPENSE_CATEGORY.food]: 'Makan',
  [EXPENSE_CATEGORY.coffee]: 'Kopi',
  [EXPENSE_CATEGORY.transport]: 'Transportasi',
  [EXPENSE_CATEGORY.shopping]: 'Belanja',
  [EXPENSE_CATEGORY.bills]: 'Tagihan',
  [EXPENSE_CATEGORY.paylaterInstalment]: 'Paylater',
  [EXPENSE_CATEGORY.savingsDeposit]: 'Tabungan',
  [EXPENSE_CATEGORY.insurance]: 'Proteksi',
  [EXPENSE_CATEGORY.entertainment]: 'Hiburan',
  [EXPENSE_CATEGORY.health]: 'Kesehatan',
  [EXPENSE_CATEGORY.education]: 'Pendidikan',
  [EXPENSE_CATEGORY.household]: 'Rumah Tangga',
  [EXPENSE_CATEGORY.otherExpense]: 'Lainnya',
};

/** The budget block, or nothing before Atur Budget was saved. */
export async function budgetExportSections(
  userId: string,
  deps: { repository?: BudgetRepository } = {},
): Promise<ExportSection[]> {
  const allocations = await (deps.repository ?? budgetRepository).findAllocations(userId);
  if (!allocations || allocations.length === 0) return [];
  return [
    {
      title: 'Uang · Budget',
      header: ['Kategori', 'Batas per Periode'],
      rows: allocations.map((row) => [CATEGORY_LABEL[row.category], String(row.amount)]),
    },
  ];
}
