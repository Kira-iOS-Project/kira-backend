import { debtAccounts, recurringBills } from '../../db/schema/schema.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type { BillRow } from './finance.repository.types.ts';

export const billScheduleColumns = {
  id: recurringBills.id,
  name: recurringBills.name,
  amount: recurringBills.amount,
  category: recurringBills.category,
  nextDueDate: recurringBills.nextDueDate,
  repeatInterval: recurringBills.repeatInterval,
  installmentsTotal: recurringBills.installmentsTotal,
  installmentsRemaining: recurringBills.installmentsRemaining,
  linkedDebtAccountId: recurringBills.linkedDebtAccountId,
};

export const billColumns = { ...billScheduleColumns, linkedDebtName: debtAccounts.name };

type DatabaseBillRow = Omit<BillRow, 'paidThisPeriod' | 'category'> & { category: string };

export function billRow(row: DatabaseBillRow): BillRow {
  return {
    ...row,
    category: expenseCategorySchema.parse(row.category),
    paidThisPeriod: false,
  };
}
