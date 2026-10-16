import { describe, expect, test } from 'bun:test';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createBankImportRepository } from '../bank-import.repository.ts';
import { createImportRowMock, IMPORT_ID, NOW, ROW_ID } from './helpers.ts';

describe('createBankImportRepository', () => {
  test('finds what was recorded in the range', async () => {
    const fake = createFakeDb(
      inOrder([{ occurredAt: NOW.toISOString(), type: TRANSACTION_TYPE.expense, amount: 18_000 }]),
    );

    const rows = await createBankImportRepository(fake.db).findRecorded('user-1', NOW, NOW);

    expect(rows).toEqual([{ occurredAt: NOW, type: TRANSACTION_TYPE.expense, amount: 18_000 }]);
    expect(fake.queries[0]?.sql).toContain('limit $4');
  });

  test('stores an import and its rows together', async () => {
    const fake = createFakeDb();
    await createBankImportRepository(fake.db).create({
      bankImport: {
        id: IMPORT_ID,
        userId: 'user-1',
        fileName: 'a.csv',
        fileSize: 1,
        rowCount: 1,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-01',
      },
      rows: [
        {
          id: ROW_ID,
          importId: IMPORT_ID,
          rowIndex: 0,
          occurredOn: '2026-10-01',
          description: 'x',
          type: TRANSACTION_TYPE.expense,
          amount: 1,
          category: EXPENSE_CATEGORY.food,
          isDuplicate: false,
        },
      ],
    });
    expect(fake.queries.map((query) => query.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'insert into "bank_imports"',
      'insert into "bank_import_rows"',
    ]);
  });

  test('finds an import and its rows in order', async () => {
    const state = { committedAt: null, savedCount: null, skippedCount: null };
    const fake = createFakeDb(inOrder([state], [], [createImportRowMock()]));
    const repository = createBankImportRepository(fake.db);

    expect(await repository.findImport('user-1', IMPORT_ID)).toEqual(state);
    expect(await repository.findImport('user-1', IMPORT_ID)).toBeNull();
    expect(await repository.findRows(IMPORT_ID)).toEqual([createImportRowMock()]);
    expect(fake.queries[2]?.sql).toContain('order by "bank_import_rows"."row_index" asc');
  });

  const commit = (
    transactions: Parameters<
      ReturnType<typeof createBankImportRepository>['commit']
    >[0]['transactions'],
  ) => ({
    userId: 'user-1',
    importId: IMPORT_ID,
    savedCount: transactions.length,
    skippedCount: 0,
    now: NOW,
    transactions,
  });
  const transaction = {
    userId: 'user-1',
    type: TRANSACTION_TYPE.expense,
    amount: 1,
    category: EXPENSE_CATEGORY.food,
    name: 'x',
    occurredAt: NOW,
    source: TRANSACTION_SOURCE.bankImport,
  };

  test('claims the import and saves the rows once', async () => {
    const fake = createFakeDb(inOrder([{ id: IMPORT_ID }], [], [{ id: IMPORT_ID }], []));
    const repository = createBankImportRepository(fake.db);

    expect(await repository.commit(commit([transaction]))).toBe(true);
    expect(await repository.commit(commit([]))).toBe(true);
    expect(await repository.commit(commit([transaction]))).toBe(false);
    expect(fake.queries.map((query) => query.sql.split(' ')[0])).toEqual([
      'update',
      'insert',
      'update',
      'update',
    ]);
    expect(fake.queries[0]?.sql).toContain('"bank_imports"."committed_at" is null');
  });
});
