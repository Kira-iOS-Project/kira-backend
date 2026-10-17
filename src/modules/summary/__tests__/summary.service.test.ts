import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import type { SummaryRepository } from '../summary.repository.ts';
import { getWeeklySummary } from '../summary.service.ts';

/** The board's week: Kamis 8 – Rabu 14 Oktober 2026, Rp1.385.000,00, Rp120.000,00 less than before. */
function repositoryOf(budget: Awaited<ReturnType<SummaryRepository['findBudget']>> = null) {
  const ranges: [Date, Date][] = [];
  const repository: SummaryRepository = {
    expenseByDay: async () => [
      { date: '2026-10-10', expense: 310_000 },
      { date: '2026-10-12', expense: 95_000 },
      { date: '2026-10-14', expense: 980_000 },
    ],
    expenseByCategory: async () => [
      { category: EXPENSE_CATEGORY.food, amount: 640_000 },
      { category: EXPENSE_CATEGORY.transport, amount: 285_000 },
    ],
    expenseTotal: async (_, from, to) => {
      ranges.push([from, to]);
      return ranges.length === 1 ? 1_505_000 : 2_350_000;
    },
    findBudget: async () => budget,
  };
  return { repository, ranges };
}

describe('getWeeklySummary', () => {
  test('seven WIB days ending today, the empty ones 0, against the seven before', async () => {
    const { repository, ranges } = repositoryOf();
    const week = await getWeeklySummary(
      'user-1',
      {},
      { repository, now: () => new Date('2026-10-14T10:00:00+07:00') },
    );
    expect(week.start).toBe('2026-10-08');
    expect(week.end).toBe('2026-10-14');
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toEqual({ date: '2026-10-08', expense: 0 });
    expect(week.days[2]).toEqual({ date: '2026-10-10', expense: 310_000 });
    expect(week.total).toBe(1_385_000);
    expect(week.previousTotal - week.total).toBe(120_000);
    expect(week.categories[0]).toEqual({ category: EXPENSE_CATEGORY.food, amount: 640_000 });
    expect(week.budget).toBeNull();
    expect(ranges[0]?.[0].toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(ranges[0]?.[1].toISOString()).toBe('2026-10-07T17:00:00.000Z');
  });

  test('the budget of the payday period `end` falls in: a payday day, or the month’s end', async () => {
    const allocations = [
      { category: EXPENSE_CATEGORY.food, amount: 2_500_000 },
      { category: EXPENSE_CATEGORY.transport, amount: 1_500_000 },
    ];
    const day = repositoryOf({ allocations, payday: { type: 'day', day: 25 } });
    const onDay = await getWeeklySummary(
      'user-1',
      { end: '2026-10-14' },
      { repository: day.repository },
    );
    expect(onDay.budget).toEqual({
      amount: 4_000_000,
      spent: 2_350_000,
      periodStart: '2026-09-25',
      periodEnd: '2026-10-24',
    });
    const last = repositoryOf({ allocations, payday: { type: 'endOfMonth' } });
    const onLast = await getWeeklySummary(
      'user-1',
      { end: '2026-10-14' },
      { repository: last.repository },
    );
    expect(onLast.budget?.periodStart).toBe('2026-09-30');
    expect(onLast.budget?.periodEnd).toBe('2026-10-30');
  });
});
