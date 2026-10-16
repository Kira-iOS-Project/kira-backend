/**
 * Mock builders for the bank-import module's injected dependencies (AGENTS.md Rule 19).
 */

import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { BankImportRepository, ImportRow } from '../bank-import.repository.ts';

export const NOW = new Date('2026-10-16T05:41:00.000Z');
export const IMPORT_ID = '9d0e1f2a-0000-4000-8000-000000000001';
export const ROW_ID = '9d0e1f2a-0000-4000-8000-0000000000a1';
export const OTHER_ROW_ID = '9d0e1f2a-0000-4000-8000-0000000000a2';

export const IMPORT_BODY = {
  fileName: 'mutasi-oktober.csv',
  fileSize: 2048,
  rows: [
    {
      date: '2026-10-02',
      description: 'GRAB*TRIP',
      amount: -18_000,
      category: EXPENSE_CATEGORY.transport,
    },
    {
      date: '2026-10-01',
      description: 'GAJI OKTOBER',
      amount: 6_000_000,
      category: INCOME_CATEGORY.salary,
    },
  ],
};

export function createImportRowMock(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    id: ROW_ID,
    occurredOn: '2026-10-02',
    description: 'GRAB*TRIP',
    type: TRANSACTION_TYPE.expense,
    amount: 18_000,
    category: EXPENSE_CATEGORY.transport,
    ...overrides,
  };
}

export function createBankImportRepositoryMock(
  overrides: Partial<BankImportRepository> = {},
): BankImportRepository {
  return {
    findRecorded: async () => [],
    create: async () => undefined,
    findImport: async () => null,
    findRows: async () => [],
    commit: async () => true,
    ...overrides,
  };
}
