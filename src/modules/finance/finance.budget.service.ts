import { addDays, daysBetween, daysInMonth, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { INDICATOR } from '../../lib/constants/score.ts';
import { targetMultipleOf } from '../score/index.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';
import { INDONESIAN_NATIONAL_HOLIDAYS } from './indonesian-holidays.ts';
import type { PaydayChoice } from './finance.budget.schema.ts';

type Deps = { repository?: BudgetRepository; now?: () => Date };

function paydayDate(
  year: number,
  month: number,
  choice: PaydayChoice,
  holidays: ReadonlySet<string>,
) {
  const lastDay = daysInMonth(year, month);
  const day = choice.type === 'endOfMonth' ? lastDay : Math.min(choice.day, lastDay);
  let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  while (isNonBusinessDay(date, holidays)) date = addDays(date, -1);
  return date;
}

function isNonBusinessDay(date: string, holidays: ReadonlySet<string>) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.has(date);
}

function shiftedMonth(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1] as const;
}

function currentPaydayPeriod(today: string, choice: PaydayChoice) {
  const [year = 0, month = 1] = today.split('-').map(Number);
  const holidaySet = new Set(INDONESIAN_NATIONAL_HOLIDAYS.map(({ date }) => date));
  const candidates = [-1, 0, 1, 2]
    .map((offset) => {
      const [candidateYear, candidateMonth] = shiftedMonth(year, month, offset);
      return paydayDate(candidateYear, candidateMonth, choice, holidaySet);
    })
    .toSorted();
  const startIndex = candidates.reduce((last, date, index) => (date <= today ? index : last), -1);
  const periodStart = candidates[startIndex] ?? candidates[0] ?? today;
  const nextPayday = candidates.find((date) => date > today) ?? addDays(periodStart, 31);
  return {
    adjustedDate: periodStart,
    periodStart,
    periodEnd: addDays(nextPayday, -1),
    nextPayday,
    daysUntilPayday: daysBetween(today, nextPayday),
  };
}

type GoalProfile = Awaited<ReturnType<BudgetRepository['getBudgetGoalProfile']>>;

function goalPosts(profile: GoalProfile) {
  const essential = profile?.essentialMonthlyExpenses ?? 0;
  if (!profile || essential <= 0) return [];
  const multiple = targetMultipleOf({
    maritalStatus: profile.maritalStatus,
    dependents: profile.dependents,
  });
  const currentAmount = profile.emergencyFund ?? 0;
  const milestones = [1, multiple / 2, multiple].map((value) => {
    const amount = Math.round(essential * value);
    return {
      amount,
      label: `${String(value).replace('.', ',')}×`,
      reached: currentAmount >= amount,
    };
  });
  return [
    {
      category: INDICATOR.emergencyFund,
      name: 'Dana Darurat',
      currentAmount,
      targetAmount: Math.round(essential * multiple),
      milestones,
    },
  ];
}

export async function getCurrentBudget(userId: string, deps: Deps = {}) {
  const repository = deps.repository ?? budgetRepository;
  const now = (deps.now ?? (() => new Date()))();
  const saved = await repository.getBudget(userId);
  const defaults = saved ?? { ...(await repository.getProfileBudget(userId)), allocations: [] };
  const today = wibDate(now);
  const payday = currentPaydayPeriod(today, defaults.payday);
  const [spending, profile] = await Promise.all([
    repository.spendingByCategory(
      userId,
      wibStartOfDay(payday.periodStart),
      wibStartOfDay(addDays(today, 1)),
    ),
    repository.getBudgetGoalProfile(userId),
  ]);
  const spentByCategory = new Map(spending.map((row) => [row.category, row.amount]));
  const totalSpent = spending.reduce((total, row) => total + row.amount, 0);
  const totalAllocated = defaults.allocations.reduce((total, row) => total + row.amount, 0);
  return {
    configured: saved !== null,
    income: defaults.income,
    remaining: defaults.income - totalSpent,
    allocations: defaults.allocations.map((allocation) => {
      const spent = spentByCategory.get(allocation.category) ?? 0;
      return {
        ...allocation,
        spent,
        nearLimit: allocation.amount > 0 && spent * 10 >= allocation.amount * 9,
      };
    }),
    totalAllocated,
    overAllocated: totalAllocated > defaults.income,
    goalPosts: goalPosts(profile),
    payday: { requested: defaults.payday, ...payday },
  };
}
