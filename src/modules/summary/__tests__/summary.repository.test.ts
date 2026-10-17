import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createSummaryRepository } from '../summary.repository.ts';

const FROM = new Date('2026-10-07T17:00:00.000Z');
const TO = new Date('2026-10-14T17:00:00.000Z');

describe('createSummaryRepository', () => {
  test('sums expenses per WIB day and per category, largest first, dropping nothing spent', async () => {
    const fake = createFakeDb(
      inOrder(
        [{ date: '2026-10-10', expense: '310000' }],
        [
          { category: EXPENSE_CATEGORY.food, amount: '640000' },
          { category: EXPENSE_CATEGORY.coffee, amount: '0' },
        ],
      ),
    );
    const repository = createSummaryRepository(fake.db);
    expect(await repository.expenseByDay('user-1', FROM, TO)).toEqual([
      { date: '2026-10-10', expense: 310_000 },
    ]);
    expect(await repository.expenseByCategory('user-1', FROM, TO)).toEqual([
      { category: EXPENSE_CATEGORY.food, amount: 640_000 },
    ]);
    expect(fake.queries[0]?.sql).toContain("at time zone 'Asia/Jakarta'");
    expect(fake.queries[1]?.sql).toContain('group by "transactions"."category"');
    expect(fake.queries[1]?.params).toContain(TRANSACTION_TYPE.expense);
  });

  test('totals a range, 0 when empty; reads the budget, or none', async () => {
    const fake = createFakeDb(
      inOrder(
        [{ total: '1505000' }],
        [],
        [
          {
            allocations: JSON.stringify([{ category: EXPENSE_CATEGORY.food, amount: 1 }]),
            payday: '{"type":"day","day":25}',
          },
        ],
        [],
      ),
    );
    const repository = createSummaryRepository(fake.db);
    expect(await repository.expenseTotal('user-1', FROM, TO)).toBe(1_505_000);
    expect(await repository.expenseTotal('user-1', FROM, TO)).toBe(0);
    expect(await repository.findBudget('user-1')).toEqual({
      allocations: [{ category: EXPENSE_CATEGORY.food, amount: 1 }],
      payday: { type: 'day', day: 25 },
    });
    expect(await repository.findBudget('user-1')).toBeNull();
  });
});
