import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import type { CategoryTotal } from '../finance.repository.types.ts';
import { getWeeklySummary } from '../finance.weekly.service.ts';

const WEEK = '2026-10-15';

function readRepository(
  options: {
    current?: { date: string; expense: number; income: number }[];
    previous?: { date: string; expense: number; income: number }[];
    categories?: CategoryTotal[];
  } = {},
) {
  const calls: { userId: string; from: Date; to: Date }[] = [];
  const repository = {
    async totals(userId: string, from: Date, to: Date) {
      calls.push({ userId, from, to });
      return calls.length === 1 ? (options.current ?? []) : (options.previous ?? []);
    },
    async categories() {
      return options.categories ?? [];
    },
  };
  return { repository, calls };
}

describe('getWeeklySummary', () => {
  test('returns a Thursday-Wednesday range, daily gaps, comparison, and four top categories', async () => {
    const { repository, calls } = readRepository({
      current: [
        { date: '2026-10-15', expense: 100, income: 500 },
        { date: '2026-10-20', expense: 50, income: 0 },
      ],
      previous: [{ date: '2026-10-08', expense: 120, income: 20 }],
      categories: [1, 2, 3, 4, 5].map((amount) => ({
        category: EXPENSE_CATEGORY.food,
        amount,
      })),
    });

    const summary = await getWeeklySummary('owner', WEEK, { repository });

    expect(summary.period).toEqual({ from: '2026-10-15', to: '2026-10-21' });
    expect(summary.totals).toEqual({ expense: 150, income: 500, net: 350 });
    expect(summary.previous).toEqual({ expense: 120, income: 20, net: -100 });
    expect(summary.days).toHaveLength(7);
    expect(summary.days[1]).toEqual({ date: '2026-10-16', expense: 0, income: 0 });
    expect(summary.topCategories).toHaveLength(4);
    expect(summary.note).toBe('Pengeluaran minggu ini lebih tinggi daripada minggu lalu.');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.from.toISOString()).toBe('2026-10-14T17:00:00.000Z');
    expect(calls[0]?.to.toISOString()).toBe('2026-10-21T17:00:00.000Z');
    expect(calls[1]?.from.toISOString()).toBe('2026-10-07T17:00:00.000Z');
  });

  test('uses a neutral first-week note when there is activity and no prior expense', async () => {
    const { repository } = readRepository({
      current: [{ date: WEEK, expense: 20, income: 0 }],
    });
    await expect(getWeeklySummary('owner', WEEK, { repository })).resolves.toMatchObject({
      note: 'Kamu sudah mulai mencatat keuangan minggu ini.',
    });
  });

  test('reports lower and unchanged spending deterministically', async () => {
    const less = readRepository({
      current: [{ date: WEEK, expense: 50, income: 0 }],
      previous: [{ date: '2026-10-08', expense: 100, income: 0 }],
    });
    const same = readRepository({
      current: [{ date: WEEK, expense: 100, income: 0 }],
      previous: [{ date: '2026-10-08', expense: 100, income: 0 }],
    });
    await expect(
      getWeeklySummary('owner', WEEK, { repository: less.repository }),
    ).resolves.toMatchObject({
      note: 'Pengeluaran minggu ini lebih rendah daripada minggu lalu.',
    });
    await expect(
      getWeeklySummary('owner', WEEK, { repository: same.repository }),
    ).resolves.toMatchObject({
      note: 'Pengeluaran minggu ini sama dengan minggu lalu.',
    });
  });

  test('leaves a transaction-free week without an artificial note', async () => {
    const { repository } = readRepository();
    await expect(getWeeklySummary('owner', WEEK, { repository })).resolves.toMatchObject({
      totals: { expense: 0, income: 0 },
      note: null,
    });
  });

  test('requires the selected week to start on Thursday', async () => {
    const { repository } = readRepository();
    await expect(getWeeklySummary('owner', '2026-10-16', { repository })).rejects.toThrow(
      'Weekly summary must start on Thursday.',
    );
  });
});
