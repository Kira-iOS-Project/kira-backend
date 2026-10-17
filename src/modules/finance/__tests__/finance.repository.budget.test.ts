import { beforeEach, describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../../lib/constants/money.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { budgetRepository } from '../finance.repository.budget.ts';

beforeEach(() => resetExternalMocks());

describe('budget repository', () => {
  test('upserts the owner budget and payday selection', async () => {
    dbControl.respond = () => [];
    await budgetRepository.saveBudget('owner-1', {
      income: 300_000,
      allocations: [{ category: EXPENSE_CATEGORY.bills, amount: 120_000 }],
      payday: { type: 'endOfMonth' },
    });

    expect(dbControl.queries.at(-1)?.sql).toContain('insert into "budgets"');
    expect(dbControl.queries.at(-1)?.sql).toContain('on conflict');
    expect(dbControl.queries.at(-1)?.sql).toContain('"payday"');
  });

  test('groups only expense categories for the owner and bounds the query', async () => {
    dbControl.respond = (query) =>
      query.sql.includes('from "transactions"')
        ? [
            { category: EXPENSE_CATEGORY.bills, amount: 25_000 },
            { category: INCOME_CATEGORY.salary, amount: 50_000 },
          ]
        : [];

    const rows = await budgetRepository.spendingByCategory(
      'owner-1',
      new Date('2026-10-01T17:00:00.000Z'),
      new Date('2026-10-17T17:00:00.000Z'),
    );

    expect(rows).toEqual([{ category: EXPENSE_CATEGORY.bills, amount: 25_000 }]);
    expect(dbControl.queries[0]?.sql).toContain('"user_id" =');
    expect(dbControl.queries[0]?.sql).toContain('limit');
  });
});
