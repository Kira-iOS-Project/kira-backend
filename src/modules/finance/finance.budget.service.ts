/**
 * Budget per Kategori (UNG-04) and Atur Budget (UNG-05). The period is Beranda's payday period
 * (coordinator's decision A: no weekend or holiday shift, so both screens always agree; moving a
 * payday off a holiday is a follow-up, see Derry's 3a28735). Income is the health check's; the
 * Dana Darurat pos is Rencana's goal ("Diambil dari tujuan Dana Darurat").
 */

import { addDays, paydayPeriod, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { emergencyGoalOf, type EmergencyGoal } from '../plan/index.ts';
import type { CurrentBudget, SaveBudgetBody } from './finance.budget.schema.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';

/** Atur Budget's "Rata-rata 3 bulan" hint: this many payday periods before the current one. */
const AVERAGE_PERIODS = 3;

type Deps = {
  repository?: BudgetRepository;
  emergencyGoal?: (userId: string) => Promise<EmergencyGoal | null>;
  now?: () => Date;
};

/** Spent at least 90% of the limit: Budget's kunyit tag ("Sisa Rp60.000,00"). */
const isNearLimit = (spent: number, limit: number) => limit > 0 && spent * 10 >= limit * 9;

export async function getCurrentBudget(userId: string, deps: Deps = {}): Promise<CurrentBudget> {
  const repository = deps.repository ?? budgetRepository;
  const today = wibDate((deps.now ?? (() => new Date()))());
  const [saved, { income, payday }, goal, instalmentsMonthly] = await Promise.all([
    repository.findAllocations(userId),
    repository.findIncomeAndPayday(userId),
    (deps.emergencyGoal ?? emergencyGoalOf)(userId),
    repository.monthlyInstalments(userId),
  ]);
  const period = paydayPeriod(today, payday);
  let earliest = period.start;
  for (let index = 0; index < AVERAGE_PERIODS; index += 1) {
    earliest = paydayPeriod(addDays(earliest, -1), payday).start;
  }
  const [spending, past] = await Promise.all([
    repository.spendingByCategory(
      userId,
      wibStartOfDay(period.start),
      wibStartOfDay(addDays(today, 1)),
    ),
    repository.spendingByCategory(userId, wibStartOfDay(earliest), wibStartOfDay(period.start)),
  ]);
  const spent = new Map(spending.map((row) => [row.category, row.amount]));
  const allocations = saved ?? [];
  const totalAllocated = allocations.reduce((sum, row) => sum + row.amount, 0);
  return {
    configured: saved !== null,
    income,
    remaining: income - spending.reduce((sum, row) => sum + row.amount, 0),
    allocations: allocations.map((row) => {
      const used = spent.get(row.category) ?? 0;
      return Object.assign({}, row, { spent: used, nearLimit: isNearLimit(used, row.amount) });
    }),
    totalAllocated,
    overAllocated: totalAllocated > income,
    averages: past.map((row) => ({
      category: row.category,
      amount: Math.round(row.amount / AVERAGE_PERIODS),
    })),
    instalmentsMonthly,
    goalPost: goal
      ? {
          goalId: goal.id,
          monthlyDeposit: goal.monthlyDeposit,
          savedAmount: goal.saved,
          targetAmount: goal.target,
        }
      : null,
    payday: {
      requested: payday,
      periodStart: period.start,
      periodEnd: period.end,
      nextPayday: period.nextPayday,
      daysUntilPayday: period.daysUntilPayday,
    },
  };
}

/** Simpan Budget: stores the limits and the payday, then answers the budget as Budget shows it. */
export async function saveCurrentBudget(
  userId: string,
  body: SaveBudgetBody,
  deps: Deps = {},
): Promise<CurrentBudget> {
  const repository = deps.repository ?? budgetRepository;
  await repository.save(userId, body.allocations, body.payday);
  return getCurrentBudget(userId, deps);
}
