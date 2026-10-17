/** Budget's queries, each scoped to the person, against the shared Postgres double. */

import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createBudgetRepository } from '../finance.repository.budget.ts';

const LIMITS = [{ category: EXPENSE_CATEGORY.food, amount: 1_800_000 }];

describe('createBudgetRepository', () => {
  test('reads the saved limits, or null before Atur Budget', async () => {
    const fake = createFakeDb(inOrder([{ allocations: LIMITS }], []));
    const repository = createBudgetRepository(fake.db);

    expect(await repository.findAllocations('owner-1')).toEqual(LIMITS);
    expect(await repository.findAllocations('owner-1')).toBeNull();
    expect(fake.queries[0]?.params).toContain('owner-1');
  });

  test('reads the income and the payday, with defaults before the health check', async () => {
    const fake = createFakeDb(inOrder([{ income: 7_500_000, day: 25, endOfMonth: false }], []));
    const repository = createBudgetRepository(fake.db);

    expect(await repository.findIncomeAndPayday('owner-1')).toEqual({
      income: 7_500_000,
      payday: { day: 25, endOfMonth: false },
    });
    expect(await repository.findIncomeAndPayday('owner-1')).toEqual({
      income: 0,
      payday: { day: null, endOfMonth: false },
    });
  });

  test('groups only expense categories for the owner', async () => {
    const fake = createFakeDb(
      inOrder([
        { category: EXPENSE_CATEGORY.bills, amount: '25000' },
        { category: INCOME_CATEGORY.salary, amount: '50000' },
      ]),
    );
    const rows = await createBudgetRepository(fake.db).spendingByCategory(
      'owner-1',
      new Date('2026-10-01T17:00:00.000Z'),
      new Date('2026-10-17T17:00:00.000Z'),
    );

    expect(rows).toEqual([{ category: EXPENSE_CATEGORY.bills, amount: 25_000 }]);
    expect(fake.queries[0]?.sql).toContain('group by');
    expect(fake.queries[0]?.params).toContain('owner-1');
  });

  test("adds up the open debt accounts' instalments", async () => {
    const fake = createFakeDb(inOrder([{ total: '1350000' }], []));
    const repository = createBudgetRepository(fake.db);

    expect(await repository.monthlyInstalments('owner-1')).toBe(1_350_000);
    expect(await repository.monthlyInstalments('owner-1')).toBe(0);
    expect(fake.queries[0]?.sql).toContain('"paid_off_at" is null');
  });

  test('saves the payday and the limits in one transaction', async () => {
    const fake = createFakeDb(inOrder([], []));
    await createBudgetRepository(fake.db).save('owner-1', LIMITS, { day: 25, endOfMonth: false });

    expect(fake.queries[0]?.sql).toContain('update "users" set "payday_day"');
    expect(fake.queries[1]?.sql).toContain('on conflict ("user_id") do update');
  });
});
