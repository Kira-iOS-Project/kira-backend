/**
 * Ringkasan Mingguan's numbers (UNG-08, KIR-42): the seven WIB days ending on `end`, their expenses
 * per day and per category, the seven days before for "Lebih Sedikit dari Minggu Lalu", and the
 * budget of the payday period `end` falls in. The app composes the sentences.
 */

import { addDays, paydayPeriod, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { type SummaryRepository, summaryRepository } from './summary.repository.ts';
import type { WeeklySummary } from './summary.schema.ts';

export type SummaryDeps = { repository?: SummaryRepository; now?: () => Date };

/** Days in a week, the last one included. */
const WEEK_DAYS = 7;

export async function getWeeklySummary(
  userId: string,
  query: { end?: string | undefined },
  deps: SummaryDeps = {},
): Promise<WeeklySummary> {
  const repository = deps.repository ?? summaryRepository;
  const end = query.end ?? wibDate((deps.now ?? (() => new Date()))());
  const start = addDays(end, 1 - WEEK_DAYS);
  const from = wibStartOfDay(start);
  const to = wibStartOfDay(addDays(end, 1));
  const [byDay, categories, previousTotal, budget] = await Promise.all([
    repository.expenseByDay(userId, from, to),
    repository.expenseByCategory(userId, from, to),
    repository.expenseTotal(userId, wibStartOfDay(addDays(start, -WEEK_DAYS)), from),
    budgetOf(userId, end, repository),
  ]);
  const spent = new Map(byDay.map((day) => [day.date, day.expense]));
  const days = Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = addDays(start, index);
    return { date, expense: spent.get(date) ?? 0 };
  });
  const total = days.reduce((sum, day) => sum + day.expense, 0);
  return { start, end, total, previousTotal, days, categories, budget };
}

/** The budget's total against the payday period `end` falls in, by the account's payday. */
async function budgetOf(
  userId: string,
  end: string,
  repository: SummaryRepository,
): Promise<WeeklySummary['budget']> {
  const budget = await repository.findBudget(userId);
  if (!budget) return null;
  const period = paydayPeriod(end, budget.payday);
  const spent = await repository.expenseTotal(
    userId,
    wibStartOfDay(period.start),
    wibStartOfDay(addDays(period.end, 1)),
  );
  const amount = budget.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  return { amount, spent, periodStart: period.start, periodEnd: period.end };
}
