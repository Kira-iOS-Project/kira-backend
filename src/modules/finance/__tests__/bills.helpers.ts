/**
 * Fixtures for Tagihan & Cicilan: the board's Internet Rumah (Rp350.000 on the 22nd) and Cicilan
 * Motor (Rp910.000 on the 28th, the instalment of a debt with 14 months left), and a repository
 * double.
 */

import { BILL_REPEAT } from '../../../lib/constants/ung.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import type { BillRepository, BillRow } from '../finance.repository.bills.ts';

export const BILL_ID = '7c3e4f50-6d7e-4a80-8b9c-1d2e3f4a5b6c';
export const DEBT_ID = '8d4f5a61-7e8f-4b91-9cad-2e3f4a5b6c7d';
/** 17 October 2026, 10.00 WIB. */
export const NOW = new Date('2026-10-17T03:00:00.000Z');

export function billRow(overrides: Partial<BillRow> = {}): BillRow {
  return {
    id: BILL_ID,
    name: 'Internet Rumah',
    category: EXPENSE_CATEGORY.bills,
    amount: 350_000,
    isEstimate: false,
    repeats: BILL_REPEAT.monthly,
    dueOn: '2026-09-22',
    lastPaidOn: null,
    debtId: null,
    remainingTenorMonths: null,
    createdAt: new Date('2026-09-01T03:00:00.000Z'),
    ...overrides,
  };
}

export const MOTOR = billRow({
  id: '9e5a6b72-8f90-4ca2-8dbe-3f4a5b6c7d8e',
  name: 'Cicilan Motor',
  category: EXPENSE_CATEGORY.transport,
  amount: 910_000,
  dueOn: '2026-10-28',
  debtId: DEBT_ID,
  remainingTenorMonths: 14,
});

export function billRepositoryMock(overrides: Partial<BillRepository> = {}): BillRepository {
  return {
    listBills: async () => [billRow()],
    findBill: async () => billRow(),
    insertBill: async () => billRow(),
    updateBill: async () => true,
    deleteBill: async () => true,
    ownsDebt: async () => true,
    lastDebtPayments: async () => [],
    ...overrides,
  };
}
