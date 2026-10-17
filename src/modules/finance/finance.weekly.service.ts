import { INDONESIAN_WEEKLY_NOTE } from '../../lib/constants/ung.ts';
import { addDays, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { financeRepository } from './finance.repository.ts';
import type {
  CategoryTotal,
  FinanceRepository,
  WeeklyTotals,
  WeeklyUserCategory,
  WeeklyUserTotal,
  WeeklyWrite,
} from './finance.repository.types.ts';

type ReadRepository = Pick<FinanceRepository, 'totals' | 'categories'>;
type JobRepository = Pick<
  FinanceRepository,
  'optedInUsers' | 'weeklyTotalsForUsers' | 'weeklyCategoriesForUsers' | 'saveWeeklies'
>;
type ReadDeps = { repository?: ReadRepository };
type JobDeps = { repository?: JobRepository };

function weeklyNote(expense: number, previousExpense: number, transactionCount: number) {
  if (transactionCount === 0) return null;
  if (previousExpense === 0) return INDONESIAN_WEEKLY_NOTE.firstWeek;
  if (expense > previousExpense) return INDONESIAN_WEEKLY_NOTE.spentMore;
  if (expense < previousExpense) return INDONESIAN_WEEKLY_NOTE.spentLess;
  return INDONESIAN_WEEKLY_NOTE.spentSame;
}

function totalsOf(days: { expense: number; income: number }[]) {
  const expense = days.reduce((sum, day) => sum + day.expense, 0);
  const income = days.reduce((sum, day) => sum + day.income, 0);
  return { expense, income, net: income - expense };
}

function composeSummary(
  weekStart: string,
  currentRows: WeeklyTotals,
  previousRows: WeeklyTotals,
  categories: CategoryTotal[],
) {
  const currentByDate = new Map(currentRows.map((row) => [row.date, row]));
  const previous = totalsOf(previousRows);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStart, offset);
    const row = currentByDate.get(date);
    return { date, expense: row?.expense ?? 0, income: row?.income ?? 0 };
  });
  const totals = totalsOf(days);
  const transactionCount = currentRows.reduce(
    (count, row) => count + Number(row.expense > 0 || row.income > 0),
    0,
  );
  return {
    period: { from: weekStart, to: addDays(weekStart, 6) },
    totals,
    previous,
    days,
    topCategories: categories.slice(0, 4),
    note: weeklyNote(totals.expense, previous.expense, transactionCount),
  };
}

function assertThursday(weekStart: string) {
  if (new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 4)
    throw new RangeError('Weekly summary must start on Thursday.');
}

/** Summarize the requested Thursday-Wednesday period against the previous week. */
export async function getWeeklySummary(userId: string, weekStart: string, deps: ReadDeps = {}) {
  const repository = deps.repository ?? financeRepository;
  assertThursday(weekStart);
  const end = addDays(weekStart, 7);
  const previousStart = addDays(weekStart, -7);
  const [currentRows, previousRows, categories] = await Promise.all([
    repository.totals(userId, wibStartOfDay(weekStart), wibStartOfDay(end)),
    repository.totals(userId, wibStartOfDay(previousStart), wibStartOfDay(weekStart)),
    repository.categories(userId, wibStartOfDay(weekStart), wibStartOfDay(end)),
  ]);
  return composeSummary(weekStart, currentRows, previousRows, categories);
}

function groupTotals(rows: WeeklyUserTotal[], userId: string): WeeklyTotals {
  return rows
    .filter((row) => row.userId === userId)
    .map(({ date, expense, income }) => ({ date, expense, income }));
}

function groupCategories(rows: WeeklyUserCategory[], userId: string): CategoryTotal[] {
  return rows
    .filter((row) => row.userId === userId)
    .map(({ category, amount }) => ({ category, amount }));
}

/** Persist the closed week at the exact Thursday 06:00 WIB scheduler deadline. */
export async function generateWeeklySummaries(now: Date, deps: JobDeps = {}) {
  const repository = deps.repository ?? financeRepository;
  const users = (await repository.optedInUsers()).filter((user) => user.granted);
  if (users.length === 0) return { generated: 0, skipped: false };
  const today = wibDate(now);
  const weekStart = addDays(today, -7);
  const previousStart = addDays(weekStart, -7);
  const userIds = users.map((user) => user.userId);
  const [currentRows, previousRows, categories] = await Promise.all([
    repository.weeklyTotalsForUsers(userIds, wibStartOfDay(weekStart), wibStartOfDay(today)),
    repository.weeklyTotalsForUsers(
      userIds,
      wibStartOfDay(previousStart),
      wibStartOfDay(weekStart),
    ),
    repository.weeklyCategoriesForUsers(userIds, wibStartOfDay(weekStart), wibStartOfDay(today)),
  ]);
  const writes: WeeklyWrite[] = users.map((user) => {
    const summary = composeSummary(
      weekStart,
      groupTotals(currentRows, user.userId),
      groupTotals(previousRows, user.userId),
      groupCategories(categories, user.userId),
    );
    return {
      userId: user.userId,
      weekStart,
      expense: summary.totals.expense,
      income: summary.totals.income,
      note: summary.note,
    };
  });
  await repository.saveWeeklies(writes);
  return { generated: writes.length, skipped: false };
}

/** The next instant at 06:00 Thursday in fixed UTC+07 Western Indonesian Time. */
export { nextThursdayAt0600Wib } from '../../lib/time/wib.ts';
