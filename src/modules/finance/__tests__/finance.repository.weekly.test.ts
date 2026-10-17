import { describe, expect, test } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { weeklySummaries } from '../../../db/schema/weekly-summaries.ts';
import { createWeeklyRepository } from '../finance.repository.weekly.ts';

describe('weekly finance repository', () => {
  test('enforces a single stored summary per owner and week', () => {
    const indexes = getTableConfig(weeklySummaries).indexes.map(({ config }) => config.name);
    expect(indexes).toEqual(['weekly_summaries_user_week_idx', 'weekly_summaries_week_idx']);
  });

  test('groups daily expense and income totals in the owner timezone and range', async () => {
    const fake = createFakeDb(() => [{ date: '2026-10-15', expense: 30_000, income: 50_000 }]);
    const from = new Date('2026-10-14T17:00:00.000Z');
    const to = new Date('2026-10-21T17:00:00.000Z');

    await expect(createWeeklyRepository(fake.db).totals('owner', from, to)).resolves.toEqual([
      { date: '2026-10-15', expense: 30_000, income: 50_000 },
    ]);
    expect(fake.queries[0]?.sql).toContain("at time zone 'Asia/Jakarta'");
    expect(fake.queries[0]?.sql).toContain('"transactions"."user_id" =');
    expect(fake.queries[0]?.sql).toContain('"transactions"."occurred_at" >=');
    expect(fake.queries[0]?.sql).toContain('"transactions"."occurred_at" <');
    expect(fake.queries[0]?.sql).toContain('group by');
    expect(fake.queries[0]?.sql).toContain('limit');
  });

  test('returns only valid expense categories ordered by their amount', async () => {
    const fake = createFakeDb(() => [
      { category: EXPENSE_CATEGORY.food, amount: 30_000 },
      { category: 'invalid-category', amount: 500_000 },
    ]);

    await expect(
      createWeeklyRepository(fake.db).categories(
        'owner',
        new Date('2026-10-14T17:00:00.000Z'),
        new Date('2026-10-21T17:00:00.000Z'),
      ),
    ).resolves.toEqual([{ category: EXPENSE_CATEGORY.food, amount: 30_000 }]);
    expect(fake.queries[0]?.sql).toContain('"transactions"."type" =');
    expect(fake.queries[0]?.sql).toContain('order by');
    expect(fake.queries[0]?.sql).toContain('limit');
  });

  test('aggregates daily rows for only the requested users', async () => {
    const fake = createFakeDb(() => [
      { userId: 'owner', date: '2026-10-15', expense: 30_000, income: 50_000 },
    ]);

    await expect(
      createWeeklyRepository(fake.db).weeklyTotalsForUsers(
        ['owner', 'another'],
        new Date('2026-10-14T17:00:00.000Z'),
        new Date('2026-10-21T17:00:00.000Z'),
      ),
    ).resolves.toEqual([{ userId: 'owner', date: '2026-10-15', expense: 30_000, income: 50_000 }]);
    expect(fake.queries[0]?.sql).toContain('"transactions"."user_id" in');
    expect(fake.queries[0]?.sql).toContain('group by');
    expect(fake.queries[0]?.sql).toContain('limit');
  });

  test('groups user categories and drops invalid categories before save', async () => {
    const fake = createFakeDb(() => [
      { userId: 'owner', category: EXPENSE_CATEGORY.food, amount: 30_000 },
      { userId: 'owner', category: 'invalid-category', amount: 500_000 },
    ]);

    await expect(
      createWeeklyRepository(fake.db).weeklyCategoriesForUsers(
        ['owner'],
        new Date('2026-10-14T17:00:00.000Z'),
        new Date('2026-10-21T17:00:00.000Z'),
      ),
    ).resolves.toEqual([{ userId: 'owner', category: EXPENSE_CATEGORY.food, amount: 30_000 }]);
    expect(fake.queries[0]?.sql).toContain('"transactions"."user_id" in');
    expect(fake.queries[0]?.sql).toContain('"transactions"."type" =');
    expect(fake.queries[0]?.sql).toContain('order by');
    expect(fake.queries[0]?.sql).toContain('limit');
  });

  test('selects the latest consent state for each user', async () => {
    const fake = createFakeDb(() => [{ userId: 'owner', granted: true }]);

    await expect(createWeeklyRepository(fake.db).optedInUsers()).resolves.toEqual([
      { userId: 'owner', granted: true },
    ]);
    expect(fake.queries[0]?.sql).toContain('distinct on');
    expect(fake.queries[0]?.sql).toContain('"consents"."purpose" =');
    expect(fake.queries[0]?.sql).toContain('order by');
    expect(fake.queries[0]?.sql).toContain('limit');
  });

  test('does not issue an insert for empty output and upserts unique owner weeks', async () => {
    const fake = createFakeDb();
    const repository = createWeeklyRepository(fake.db);
    await repository.saveWeeklies([]);
    expect(fake.queries).toHaveLength(0);

    await repository.saveWeeklies([
      {
        userId: 'owner',
        weekStart: '2026-10-15',
        expense: 30_000,
        income: 50_000,
        note: 'Catatan',
      },
    ]);
    expect(fake.queries[0]?.sql).toContain('insert into "weekly_summaries"');
    expect(fake.queries[0]?.sql).toContain('on conflict');
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id","week_start")');
  });
});
