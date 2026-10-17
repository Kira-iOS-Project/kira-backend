import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { decodeCursor, encodeCursor } from '../../../lib/pagination/cursor.ts';
import type { TransactionFilters } from '../transaction.repository.ts';
import { listTransactions, summarizeTransactions } from '../transaction.list.service.ts';
import {
  createTransactionRepositoryMock,
  createTransactionRowMock,
  NOW,
  TX_ID,
} from './helpers.ts';

describe('listTransactions', () => {
  test('turns WIB dates into instants and pages newest first', async () => {
    const calls: { filters: TransactionFilters; limit: number }[] = [];
    const older = createTransactionRowMock({ id: '7c1e2d3f-0000-4000-8000-000000000009' });
    const repository = createTransactionRepositoryMock({
      list: async (_userId, filters, _cursor, limit) => {
        calls.push({ filters, limit });
        return [createTransactionRowMock(), older];
      },
    });

    const page = await listTransactions(
      'user-1',
      {
        from: '2026-10-01',
        to: '2026-10-16',
        type: TRANSACTION_TYPE.expense,
        category: EXPENSE_CATEGORY.transport,
        q: 'grab',
        cursor: encodeCursor({ at: NOW, id: TX_ID }),
        limit: 1,
      },
      { repository },
    );

    expect(calls[0]).toEqual({
      filters: {
        from: new Date('2026-09-30T17:00:00.000Z'),
        to: new Date('2026-10-16T17:00:00.000Z'),
        type: TRANSACTION_TYPE.expense,
        category: EXPENSE_CATEGORY.transport,
        q: 'grab',
      },
      limit: 2,
    });
    expect(page.items.map((item) => item.id)).toEqual([TX_ID]);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ at: NOW, id: TX_ID });
  });

  test('has no cursor on the last page', async () => {
    expect(await listTransactions('user-1', { limit: 30 })).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});

describe('summarizeTransactions', () => {
  test('adds up the days', async () => {
    const days = [
      { date: '2026-10-14', expense: 48_000, income: 0 },
      { date: '2026-10-16', expense: 18_000, income: 1_000_000 },
    ];
    const repository = createTransactionRepositoryMock({
      dailyTotals: async (_userId, from, to) => {
        expect([from, to]).toEqual([
          new Date('2026-10-13T17:00:00.000Z'),
          new Date('2026-10-16T17:00:00.000Z'),
        ]);
        return days;
      },
    });

    expect(
      await summarizeTransactions(
        'user-1',
        { from: '2026-10-14', to: '2026-10-16' },
        { repository },
      ),
    ).toEqual({
      expense: 66_000,
      income: 1_000_000,
      days,
    });
    expect(
      (await summarizeTransactions('user-1', { from: '2026-10-14', to: '2026-10-16' })).days,
    ).toEqual([]);
  });
});
