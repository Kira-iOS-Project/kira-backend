import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createLadderRepository } from '../plan.ladder.repository.ts';

describe('createLadderRepository', () => {
  test('sums essential expenses per WIB month inside the range', async () => {
    const fake = createFakeDb(inOrder([{ month: '2026-09', total: '4400000' }]));
    const from = new Date('2026-06-30T17:00:00.000Z');
    const to = new Date('2026-09-30T17:00:00.000Z');
    const months = await createLadderRepository(fake.db).essentialByMonth('user-1', from, to);

    expect(months).toEqual([{ month: '2026-09', total: 4_400_000 }]);
    const [query] = fake.queries;
    expect(query?.sql).toContain("at time zone 'Asia/Jakarta', 'YYYY-MM'");
    expect(query?.sql).toContain('group by');
    expect(query?.params).toEqual(
      expect.arrayContaining([
        'user-1',
        TRANSACTION_TYPE.expense,
        EXPENSE_CATEGORY.food,
        EXPENSE_CATEGORY.insurance,
      ]),
    );
  });
});
