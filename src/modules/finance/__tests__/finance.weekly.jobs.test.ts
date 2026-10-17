import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import type {
  WeeklyOptInUser,
  WeeklyUserCategory,
  WeeklyUserTotal,
  WeeklyWrite,
} from '../finance.repository.types.ts';
import { generateWeeklySummaries, nextThursdayAt0600Wib } from '../finance.weekly.service.ts';

function jobRepository(
  options: {
    users?: WeeklyOptInUser[];
    current?: WeeklyUserTotal[];
    previous?: WeeklyUserTotal[];
    categories?: WeeklyUserCategory[];
  } = {},
) {
  const saved: WeeklyWrite[][] = [];
  let totalCalls = 0;
  const repository = {
    async optedInUsers() {
      return options.users ?? [];
    },
    async weeklyTotalsForUsers() {
      totalCalls += 1;
      return totalCalls === 1 ? (options.current ?? []) : (options.previous ?? []);
    },
    async weeklyCategoriesForUsers() {
      return options.categories ?? [];
    },
    async saveWeeklies(rows: WeeklyWrite[]) {
      saved.push(rows);
    },
  };
  return { repository, saved };
}

describe('generateWeeklySummaries', () => {
  const scheduled = new Date('2026-10-14T23:00:00.000Z');

  test('does not issue aggregate queries when no users are opted in', async () => {
    const { repository, saved } = jobRepository();
    await expect(generateWeeklySummaries(scheduled, { repository })).resolves.toEqual({
      generated: 0,
      skipped: false,
    });
    expect(saved).toEqual([]);
  });

  test('writes summaries only for latest granted users, leaving empty notes blank', async () => {
    const { repository, saved } = jobRepository({
      users: [
        { userId: 'owner', granted: true },
        { userId: 'revoked', granted: false },
        { userId: 'empty', granted: true },
      ],
      current: [
        { userId: 'owner', date: '2026-10-08', expense: 70, income: 100 },
        { userId: 'outsider', date: '2026-10-08', expense: 999, income: 0 },
      ],
      previous: [{ userId: 'owner', date: '2026-10-01', expense: 50, income: 0 }],
      categories: [
        { userId: 'owner', category: EXPENSE_CATEGORY.food, amount: 70 },
        { userId: 'outsider', category: EXPENSE_CATEGORY.food, amount: 999 },
      ],
    });

    await expect(generateWeeklySummaries(scheduled, { repository })).resolves.toEqual({
      generated: 2,
      skipped: false,
    });
    expect(saved[0]).toEqual([
      {
        userId: 'owner',
        weekStart: '2026-10-08',
        expense: 70,
        income: 100,
        note: 'Pengeluaran minggu ini lebih tinggi daripada minggu lalu.',
      },
      {
        userId: 'empty',
        weekStart: '2026-10-08',
        expense: 0,
        income: 0,
        note: null,
      },
    ]);
  });
});

describe('weekly summary schedule', () => {
  test('returns the next exact deadline, advancing when called at the deadline', () => {
    expect(nextThursdayAt0600Wib(new Date('2026-10-14T22:59:59.000Z')).toISOString()).toBe(
      '2026-10-14T23:00:00.000Z',
    );
    expect(nextThursdayAt0600Wib(new Date('2026-10-14T23:00:00.000Z')).toISOString()).toBe(
      '2026-10-21T23:00:00.000Z',
    );
    expect(nextThursdayAt0600Wib(new Date('2026-10-16T05:00:00.000Z')).toISOString()).toBe(
      '2026-10-21T23:00:00.000Z',
    );
  });
});
