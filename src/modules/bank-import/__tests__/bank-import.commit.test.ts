import { describe, expect, test } from 'bun:test';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { BankImportRepository } from '../bank-import.repository.ts';
import { commitImport } from '../bank-import.service.ts';
import {
  createBankImportRepositoryMock,
  createImportRowMock,
  IMPORT_ID,
  NOW,
  OTHER_ROW_ID,
  ROW_ID,
} from './helpers.ts';

describe('commitImport', () => {
  const open = { committedAt: null, savedCount: null, skippedCount: null };
  const rows = [
    createImportRowMock(),
    createImportRowMock({
      id: OTHER_ROW_ID,
      description: 'X'.repeat(200),
      type: TRANSACTION_TYPE.income,
      category: INCOME_CATEGORY.salary,
    }),
  ];

  test('saves the chosen rows with their reviewed category and skips the rest', async () => {
    const commits: Parameters<BankImportRepository['commit']>[0][] = [];
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
      commit: async (input) => {
        commits.push(input);
        return true;
      },
    });

    const result = await commitImport(
      'user-1',
      IMPORT_ID,
      { rows: [{ id: OTHER_ROW_ID, category: INCOME_CATEGORY.otherIncome }] },
      { repository, now: () => NOW },
    );

    expect(result).toEqual({ savedCount: 1, skippedCount: 1 });
    expect(commits[0]?.transactions[0]).toMatchObject({
      type: TRANSACTION_TYPE.income,
      category: INCOME_CATEGORY.otherIncome,
      source: TRANSACTION_SOURCE.bankImport,
      importId: IMPORT_ID,
      occurredAt: new Date('2026-10-01T17:00:00.000Z'),
    });
    expect(commits[0]?.transactions[0]?.name).toHaveLength(80);
  });

  test('answers the stored result for a committed import, also after losing a race', async () => {
    const done = { committedAt: NOW, savedCount: 2, skippedCount: 0 };
    let reads = 0;
    let lostReads = 0;
    const racing = createBankImportRepositoryMock({
      findImport: async () => (reads++ === 0 ? open : done),
      findRows: async () => rows,
      commit: async () => false,
    });
    const lost = createBankImportRepositoryMock({
      findImport: async () => (lostReads++ === 0 ? open : null),
      commit: async () => false,
    });
    const body = { rows: [{ id: ROW_ID, category: EXPENSE_CATEGORY.transport }] };

    expect(await commitImport('user-1', IMPORT_ID, body, { repository: racing })).toEqual({
      savedCount: 2,
      skippedCount: 0,
    });
    expect(await commitImport('user-1', IMPORT_ID, body, { repository: racing })).toEqual({
      savedCount: 2,
      skippedCount: 0,
    });
    expect(await commitImport('user-1', IMPORT_ID, { rows: [] }, { repository: lost })).toEqual({
      savedCount: 0,
      skippedCount: 0,
    });
  });

  test('refuses a category that points the other way, so a debit never becomes income', async () => {
    const commits: unknown[] = [];
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
      commit: async (input) => {
        commits.push(input);
        return true;
      },
    });

    await expect(
      commitImport(
        'user-1',
        IMPORT_ID,
        { rows: [{ id: ROW_ID, category: INCOME_CATEGORY.salary }] },
        { repository },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'IMPORT_ROW_UNKNOWN' });
    expect(commits).toEqual([]);
  });

  test('refuses an unknown import and an unknown row', async () => {
    await expect(commitImport('user-1', IMPORT_ID, { rows: [] })).rejects.toMatchObject({
      statusCode: 404,
      code: 'IMPORT_NOT_FOUND',
    });
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
    });
    await expect(
      commitImport(
        'user-1',
        IMPORT_ID,
        { rows: [{ id: IMPORT_ID, category: EXPENSE_CATEGORY.food }] },
        { repository },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'IMPORT_ROW_UNKNOWN' });
  });
});
